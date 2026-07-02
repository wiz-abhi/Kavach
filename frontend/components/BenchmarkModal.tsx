"use client";

import { useEffect, useState } from "react";
import { api, type Benchmark, type BenchQuery } from "@/lib/api";

/**
 * "Why a graph database?" proof panel. Runs the SAME fraud query in Cypher (Neo4j) and
 * SQL (SQLite) against identical live data and shows the results side by side — proving
 * correctness parity and the expressiveness gap that makes this a graph problem.
 */
export function BenchmarkModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Benchmark | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.benchmark().then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-panel)] border border-[var(--border-hairline-strong)] rounded-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto animate-fade-in-down"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[var(--bg-panel)] border-b border-[var(--border-hairline)] px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">
              Why a graph database?
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Same question. Same live data. Same answer. Two very different queries.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl leading-none px-2"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-6 text-sm text-[var(--accent-danger)]">Failed to run benchmark: {error}</div>
        )}
        {!data && !error && (
          <div className="p-16 text-center text-[var(--text-muted)] text-sm">Running both engines on live data…</div>
        )}

        {data && (
          <div className="p-6 flex flex-col gap-8">
            {/* PART 1 */}
            <Comparison
              badge="Query 1 — direct links"
              question={data.question}
              cypher={data.cypher}
              sql={data.sql}
              parity={data.cypher.rows === data.sql.rows}
              parityLabel={`Both return ${data.cypher.rows} account pairs`}
              metric="rows"
            />

            {/* PART 2 */}
            <Comparison
              badge="Query 2 — trace the whole ring (transitive)"
              question={data.transitive.question}
              cypher={data.transitive.cypher}
              sql={data.transitive.sql}
              parity={data.transitive.match}
              parityLabel={`Both trace ${data.transitive.cypher.reached} accounts in the ring`}
              metric="reached"
            />

            <p className="text-sm text-[var(--text-secondary)] leading-relaxed border-t border-[var(--border-hairline)] pt-5">
              {data.note}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Comparison({
  badge,
  question,
  cypher,
  sql,
  parity,
  parityLabel,
  metric,
}: {
  badge: string;
  question: string;
  cypher: BenchQuery;
  sql: BenchQuery;
  parity: boolean;
  parityLabel: string;
  metric: "rows" | "reached";
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider font-mono text-[var(--accent-brand)] bg-[var(--accent-brand)]/10 border border-[var(--accent-brand)]/25 rounded px-2 py-0.5">
          {badge}
        </span>
        {parity && (
          <span className="text-[10px] uppercase tracking-wider font-mono text-[var(--accent-safe)] bg-[var(--accent-safe-dim)]/60 border border-[var(--accent-safe)]/30 rounded px-2 py-0.5">
            ✓ {parityLabel}
          </span>
        )}
      </div>
      <p className="text-sm text-[var(--text-primary)]/90">{question}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <QueryCard q={cypher} metric={metric} accent="brand" tag="1 native pattern" />
        <QueryCard q={sql} metric={metric} accent="warn" tag={metric === "rows" ? "3 self-joins + UNION" : "recursive CTE"} />
      </div>
    </div>
  );
}

function QueryCard({
  q,
  metric,
  accent,
  tag,
}: {
  q: BenchQuery;
  metric: "rows" | "reached";
  accent: "brand" | "warn";
  tag: string;
}) {
  const color = accent === "brand" ? "var(--accent-brand)" : "var(--accent-warn)";
  const count = metric === "rows" ? q.rows : q.reached;
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-[var(--border-hairline)] flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color }}>
          {q.engine}
        </span>
        <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wide">{tag}</span>
      </div>
      <pre className="text-[11px] font-mono text-[var(--text-secondary)] p-3 overflow-x-auto whitespace-pre leading-relaxed flex-1">
        {q.query}
      </pre>
      <div className="px-3 py-2 border-t border-[var(--border-hairline)] flex items-center gap-4 text-[11px] font-mono text-[var(--text-muted)]">
        <span>
          <span style={{ color }} className="font-semibold">
            {q.lines}
          </span>{" "}
          lines
        </span>
        <span>
          <span style={{ color }} className="font-semibold">
            {q.ms}
          </span>{" "}
          ms exec
        </span>
        <span>
          <span style={{ color }} className="font-semibold">
            {count}
          </span>{" "}
          {metric === "rows" ? "pairs" : "traced"}
        </span>
      </div>
    </div>
  );
}
