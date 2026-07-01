"use client";

import type { LiveEvent } from "@/lib/useLiveFeed";

function describeEvent(evt: LiveEvent): { text: string; tone: "default" | "danger" | "safe" } {
  switch (evt.type) {
    case "connected":
      return { text: "Connected to live feed", tone: "safe" };
    case "stats_update":
      return {
        text: `Heartbeat — ${evt.payload?.accounts ?? "?"} accounts, ${evt.payload?.transactions ?? "?"} transactions tracked`,
        tone: "default",
      };
    case "ring_injected":
      return {
        text: `New cluster formed: ${evt.payload?.accountIds?.length ?? "?"} accounts sharing infrastructure`,
        tone: "danger",
      };
    case "detection_complete":
      return {
        text: `Detection run complete — ${evt.payload?.rings?.length ?? 0} ring(s) flagged`,
        tone: evt.payload?.rings?.length ? "danger" : "safe",
      };
    default:
      return { text: evt.type, tone: "default" };
  }
}

export function LiveFeed({ events, connected }: { events: LiveEvent[]; connected: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-hairline)]">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-wide">
          Live Feed
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-mono">
          <span
            className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-[var(--accent-safe)]" : "bg-[var(--text-muted)]"}`}
          />
          {connected ? "LIVE" : "OFFLINE"}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col-reverse gap-2">
        {events.length === 0 && (
          <p className="text-xs text-[var(--text-muted)]">Waiting for activity…</p>
        )}
        {[...events].reverse().map((evt, i) => {
          const { text, tone } = describeEvent(evt);
          const dotColor =
            tone === "danger" ? "bg-[var(--accent-danger)]" : tone === "safe" ? "bg-[var(--accent-safe)]" : "bg-[var(--text-muted)]";
          return (
            <div key={i} className="flex items-start gap-2 text-xs font-mono animate-fade-in-down">
              <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
              <span className="text-[var(--text-secondary)] leading-relaxed">{text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
