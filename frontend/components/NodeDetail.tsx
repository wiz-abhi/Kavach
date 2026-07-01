"use client";

import type { GraphNode } from "@/lib/api";

export function NodeDetail({ node, onClose }: { node: GraphNode | null; onClose: () => void }) {
  if (!node) return null;
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel-raised)] p-4 flex flex-col gap-3 animate-fade-in-down">
      <div className="flex items-center justify-between">
        <span className="font-[family-name:var(--font-display)] text-sm font-semibold">Account Detail</span>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs">
          Close
        </button>
      </div>
      <div className="flex flex-col gap-1.5 text-xs">
        <Row label="ID" value={node.id} mono />
        <Row label="Name" value={node.name} />
        <Row label="City" value={node.city} />
        <Row
          label="Status"
          value={node.flagged ? "Flagged — ring member" : "Normal"}
          valueClass={node.flagged ? "text-[var(--accent-danger)]" : "text-[var(--accent-safe)]"}
        />
        <Row label="Devices" value={node.devices?.join(", ") || "—"} mono />
        <Row label="IPs" value={node.ips?.join(", ") || "—"} mono />
      </div>
    </div>
  );
}

function Row({ label, value, mono, valueClass }: { label: string; value: string; mono?: boolean; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-[var(--border-hairline)]/60 last:border-0">
      <span className="text-[var(--text-muted)] uppercase tracking-wide text-[10px] font-mono pt-0.5">{label}</span>
      <span className={`text-right ${mono ? "font-mono" : ""} ${valueClass ?? "text-[var(--text-primary)]"}`}>
        {value}
      </span>
    </div>
  );
}
