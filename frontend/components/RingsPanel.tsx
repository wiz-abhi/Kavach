"use client";

import type { Ring } from "@/lib/api";

function exportCase(ring: Ring) {
  const caseFile = {
    case_id: ring.id,
    generated_at: new Date().toISOString(),
    confidence: ring.confidence,
    member_count: ring.size,
    member_accounts: ring.member_ids,
    finding: ring.explanation,
    tool: "Kavach — graph-native fraud ring detection",
  };
  const blob = new Blob([JSON.stringify(caseFile, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `case-${ring.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

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
        <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-wide flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
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
          <div
            key={ring.id}
            onClick={() => onSelectRing?.(ring)}
            className={`cursor-pointer rounded-md border transition-colors p-3 flex flex-col gap-2 ${
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
            <div className="text-xs text-[var(--text-secondary)]">{ring.size} accounts flagged</div>
            <p className="text-xs text-[var(--text-primary)]/85 leading-relaxed">{ring.explanation}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                exportCase(ring);
              }}
              className="self-start mt-1 text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent-brand)] border border-[var(--border-hairline)] rounded px-2 py-1 transition-colors"
            >
              ⤓ Export case
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
