"use client";

import { useEffect, useState } from "react";
import { api, type GraphNode, type AccountRisk } from "@/lib/api";

export function NodeDetail({ node, onClose }: { node: GraphNode | null; onClose: () => void }) {
  const [risk, setRisk] = useState<AccountRisk | null>(null);

  useEffect(() => {
    setRisk(null);
    if (!node) return;
    let cancelled = false;
    api.account(node.id).then((r) => !cancelled && setRisk(r)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [node]);

  if (!node) return null;

  const bandColor =
    risk?.band === "high"
      ? "var(--accent-danger)"
      : risk?.band === "medium"
      ? "var(--accent-warn)"
      : "var(--accent-safe)";

  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel-raised)] p-4 flex flex-col gap-3 animate-fade-in-down">
      <div className="flex items-center justify-between">
        <span className="font-[family-name:var(--font-display)] text-sm font-semibold">Account Detail</span>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs">
          Close
        </button>
      </div>

      {/* Risk meter */}
      <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider font-mono text-[var(--text-muted)]">Risk score</span>
          <span className="text-sm font-mono font-semibold" style={{ color: bandColor }}>
            {risk ? `${risk.risk}/100` : "…"}
            {risk && <span className="ml-1.5 text-[10px] uppercase">{risk.band}</span>}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--border-hairline)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${risk?.risk ?? 0}%`, background: bandColor }}
          />
        </div>
        {risk && (
          <ul className="flex flex-col gap-1 mt-1">
            {risk.factors.map((f, i) => (
              <li key={i} className="text-[11px] text-[var(--text-secondary)] flex gap-1.5">
                <span style={{ color: bandColor }}>•</span>
                {f}
              </li>
            ))}
          </ul>
        )}
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
