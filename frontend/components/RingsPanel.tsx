"use client";

import type { Ring } from "@/lib/api";

export function RingsPanel({
  rings,
  onSelectRing,
  selectedRingId,
}: {
  rings: Ring[];
  onSelectRing?: (ring: Ring) => void;
  selectedRingId?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-wide">
          Flagged Rings
        </h2>
        <span className="text-xs font-mono text-[var(--accent-danger)]">{rings.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {rings.length === 0 && (
          <div className="text-xs text-[var(--text-muted)] px-2 py-6 text-center leading-relaxed">
            No rings flagged yet.
            <br />
            Run detection to scan the graph.
          </div>
        )}
        {rings.map((ring) => (
          <button
            key={ring.id}
            onClick={() => onSelectRing?.(ring)}
            className={`text-left rounded-md border transition-colors p-3 flex flex-col gap-2 ${
              selectedRingId === ring.id
                ? "border-[var(--accent-danger)] bg-[var(--accent-danger-dim)]/80 ring-1 ring-[var(--accent-danger)]/40"
                : "border-[var(--accent-danger)]/25 bg-[var(--accent-danger-dim)]/40 hover:bg-[var(--accent-danger-dim)]/70"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-[var(--accent-danger)]">{ring.id}</span>
              <span className="text-[10px] uppercase tracking-wide font-mono text-[var(--text-muted)]">
                {(ring.confidence * 100).toFixed(0)}% confidence
              </span>
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
              {ring.size} accounts flagged
            </div>
            <p className="text-xs text-[var(--text-primary)]/85 leading-relaxed">{ring.explanation}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
