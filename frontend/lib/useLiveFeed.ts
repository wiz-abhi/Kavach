"use client";

import { useEffect, useRef, useState } from "react";

export type LiveEvent = { type: string; payload?: any; timestamp: number };

export function useLiveFeed(onMessage?: (event: LiveEvent) => void) {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    // Resolve the WS url robustly. Derive it from the API url (https://host -> wss://host)
    // as the reliable default, and only honour an explicit NEXT_PUBLIC_WS_URL if it is a
    // well-formed ws(s):// url — this guards against a common misconfig like
    // "wss://https://host/..." that otherwise silently takes the live feed offline.
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
    const derived = apiUrl
      ? apiUrl.replace(/^http/i, "ws").replace(/\/+$/, "") + "/api/live-feed"
      : null;
    const explicit = process.env.NEXT_PUBLIC_WS_URL?.trim();
    const explicitValid = explicit && /^wss?:\/\/[a-z0-9.-]+(:\d+)?(\/|$)/i.test(explicit);
    const url = (explicitValid ? explicit : derived) || "ws://localhost:4000/api/live-feed";
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data);
          const evt: LiveEvent = { ...parsed, timestamp: Date.now() };
          setEvents((prev) => [evt, ...prev].slice(0, 50));
          onMessageRef.current?.(evt);
        } catch {
          // ignore malformed messages
        }
      };
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  return { connected, events };
}
