"use client";

import { useEffect, useState } from "react";
import { api, type PathResult } from "@/lib/api";

/**
 * Investigation tool: reveal the shortest hidden link between two accounts.
 * Powered by Neo4j shortestPath — the "how are these two secretly connected?" query.
 */
export function InvestigateModal({
  onClose,
  initialFrom = "ACC-402",
  initialTo = "ACC-406",
  autoRun,
}: {
  onClose: () => void;
  initialFrom?: string;
  initialTo?: string;
  autoRun?: boolean;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [mode, setMode] = useState<"infra" | "all">("infra");
  const [result, setResult] = useState<PathResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trace = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.path(from.trim(), to.trim(), mode));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  // Demo mode: auto-trace the prefilled pair on open.
  useEffect(() => {
    if (autoRun) trace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-panel)] border border-[var(--border-hairline-strong)] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in-down"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--border-hairline)] px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">
              Investigate connection
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Find the shortest hidden link between two accounts (Neo4j shortestPath).
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl leading-none px-2">
            ✕
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <div className="flex items-end gap-3 flex-wrap">
            <label className="flex flex-col gap-1 flex-1 min-w-[120px]">
              <span className="text-[10px] uppercase tracking-wider font-mono text-[var(--text-muted)]">Account A</span>
              <input
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-md px-3 py-2 text-sm font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 flex-1 min-w-[120px]">
              <span className="text-[10px] uppercase tracking-wider font-mono text-[var(--text-muted)]">Account B</span>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-md px-3 py-2 text-sm font-mono text-[var(--text-primary)] focus:border-[var(--accent-brand)] outline-none"
              />
            </label>
            <button
              onClick={trace}
              disabled={loading}
              className="px-4 py-2 rounded-md bg-[var(--accent-brand)] text-[#0a0d12] text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
            >
              {loading ? "Tracing…" : "Trace"}
            </button>
          </div>

          <div className="flex gap-2 text-xs">
            {(["infra", "all"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-md border transition-colors ${
                  mode === m
                    ? "border-[var(--accent-brand)]/50 bg-[var(--accent-brand)]/10 text-[var(--accent-brand)]"
                    : "border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {m === "infra" ? "Shared identity only" : "Any link (incl. transactions)"}
              </button>
            ))}
          </div>

          {error && <div className="text-sm text-[var(--accent-danger)]">{error}</div>}

          {result && !result.found && (
            <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
              {result.message ?? "No connection found."}
            </div>
          )}

          {result && result.found && result.readable && (
            <div className="rounded-lg border border-[var(--accent-warn)]/30 bg-[var(--bg-canvas)] overflow-hidden">
              <div className="px-4 py-2 border-b border-[var(--border-hairline)] flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--accent-warn)]">Hidden connection found</span>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">{result.hops} hops</span>
              </div>
              <ol className="p-4 flex flex-col gap-0">
                {result.readable.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`w-2 h-2 rounded-full mt-1.5 ${
                          i === 0 || i === result.readable!.length - 1
                            ? "bg-[var(--accent-danger)]"
                            : "bg-[var(--accent-warn)]"
                        }`}
                      />
                      {i < result.readable!.length - 1 && <span className="w-px flex-1 bg-[var(--border-hairline-strong)] my-0.5 min-h-[14px]" />}
                    </div>
                    <span className={`text-sm pb-3 ${i === 0 ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-secondary)]"}`}>
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Tip: try two accounts that never transacted directly — &quot;Shared identity only&quot; reveals the
            device/IP/phone chain that secretly ties them together. This is a single line of Cypher; in SQL it
            would require an unbounded recursive join.
          </p>
        </div>
      </div>
    </div>
  );
}
