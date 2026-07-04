"use client";

import type { LiveEvent } from "@/lib/useLiveFeed";

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function describeEvent(evt: LiveEvent): { text: string; tone: "default" | "danger" | "safe" | "warn" } | null {
  switch (evt.type) {
    case "connected":
      return { text: "Connected to live feed", tone: "safe" };
    case "transaction": {
      const p = evt.payload ?? {};
      return {
        text: `${p.from} → ${p.to}  ${inr(p.amount ?? 0)}`,
        tone: p.highValue ? "warn" : "default",
      };
    }
    case "ring_injected":
      return {
        text: `⚠ New cluster formed: ${evt.payload?.accountIds?.length ?? "?"} accounts sharing infrastructure`,
        tone: "danger",
      };
    case "detection_complete":
      return {
        text: `Detection run complete — ${evt.payload?.rings?.length ?? 0} ring(s) flagged`,
        tone: evt.payload?.rings?.length ? "danger" : "safe",
      };
    case "stats_update":
      return null; // used only to refresh counters, not shown in the feed
    default:
      return null;
  }
}

export function LiveFeed({ events, connected }: { events: LiveEvent[]; connected: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-hairline)]">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-wide flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
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
          const described = describeEvent(evt);
          if (!described) return null;
          const { text, tone } = described;
          const dotColor =
            tone === "danger"
              ? "bg-[var(--accent-danger)]"
              : tone === "safe"
              ? "bg-[var(--accent-safe)]"
              : tone === "warn"
              ? "bg-[var(--accent-warn)]"
              : "bg-[var(--text-muted)]";
          const textColor =
            tone === "danger"
              ? "text-[var(--accent-danger)]"
              : tone === "warn"
              ? "text-[var(--accent-warn)]"
              : "text-[var(--text-secondary)]";
          return (
            <div key={`${evt.timestamp}-${i}`} className="flex items-start gap-2 text-xs font-mono animate-fade-in-down">
              <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
              <span className={`leading-relaxed ${textColor}`}>{text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
