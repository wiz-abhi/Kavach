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
    const url = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000/api/live-feed";
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
