"use client";

import { useEffect, useRef, useState } from "react";
import { api, type AskResult } from "@/lib/api";

const EXAMPLES = [
  "How many fraud rings are there?",
  "What is the biggest ring?",
  "How much money was moved inside the rings?",
  "Which device is shared by the most accounts?",
  "Show me the highest value transactions",
  "Which account is the most connected?",
];

/**
 * Analyst copilot: ask in plain English, get an answer backed by a real Cypher query
 * (text-to-Cypher via Claude when configured, rule-based fallback otherwise).
 */
export function CopilotModal({ onClose }: { onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<AskResult[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = async (q: string) => {
    if (!q.trim() || loading) return;
    setLoading(true);
    setQuestion("");
    try {
      const res = await api.ask(q);
      setHistory((h) => [...h, res]);
    } catch (e: any) {
      setHistory((h) => [...h, { question: q, cypher: "", error: e.message, source: "rules" }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, loading]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[var(--bg-panel)] border border-[var(--border-hairline-strong)] rounded-xl w-full max-w-2xl h-[80vh] flex flex-col animate-fade-in-down"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--border-hairline)] px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">Analyst Copilot</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Ask in plain English — answered with live Cypher.</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl leading-none px-2">
            ✕
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
          {history.length === 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-[var(--text-muted)]">Try a question:</p>
              <div className="flex flex-col gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => send(ex)}
                    className="text-left text-sm rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-[var(--text-secondary)] hover:border-[var(--accent-brand)]/40 hover:text-[var(--text-primary)] transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {history.map((res, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="self-end max-w-[85%] rounded-lg bg-[var(--accent-brand)]/15 border border-[var(--accent-brand)]/25 px-3 py-2 text-sm text-[var(--text-primary)]">
                {res.question}
              </div>
              <div className="self-start w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] overflow-hidden">
                {res.error ? (
                  <div className="px-3 py-2 text-sm text-[var(--accent-danger)]">{res.error}</div>
                ) : (
                  <>
                    <div className="px-3 py-2 text-sm text-[var(--text-primary)] font-medium border-b border-[var(--border-hairline)]">
                      {res.answer}
                    </div>
                    {res.rows && res.rows.length > 0 && <ResultTable rows={res.rows} />}
                  </>
                )}
                <details className="border-t border-[var(--border-hairline)]">
                  <summary className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-mono text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)]">
                    Cypher · {res.source === "llm" ? "Claude" : "rules"}
                  </summary>
                  <pre className="text-[11px] font-mono text-[var(--accent-brand)]/90 px-3 py-2 overflow-x-auto whitespace-pre-wrap bg-[var(--bg-panel)]">
                    {res.cypher}
                  </pre>
                </details>
              </div>
            </div>
          ))}

          {loading && <div className="self-start text-sm text-[var(--text-muted)] animate-pulse">Querying the graph…</div>}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(question);
          }}
          className="border-t border-[var(--border-hairline)] p-3 flex gap-2 shrink-0"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about rings, devices, transactions…"
            className="flex-1 bg-[var(--bg-canvas)] border border-[var(--border-hairline)] rounded-md px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-brand)] outline-none"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="px-4 py-2 rounded-md bg-[var(--accent-brand)] text-[#0a0d12] text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}

function ResultTable({ rows }: { rows: Record<string, any>[] }) {
  const cols = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto max-h-52">
      <table className="w-full text-xs font-mono">
        <thead className="sticky top-0 bg-[var(--bg-panel)]">
          <tr className="text-left text-[var(--text-muted)]">
            {cols.map((c) => (
              <th key={c} className="px-3 py-1.5 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 25).map((r, i) => (
            <tr key={i} className="border-t border-[var(--border-hairline)]">
              {cols.map((c) => (
                <td key={c} className="px-3 py-1.5 text-[var(--text-secondary)] whitespace-nowrap">
                  {formatCell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v: any): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.length > 4 ? `${v.slice(0, 4).join(", ")}… (${v.length})` : v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "number") return v.toLocaleString("en-IN");
  return String(v);
}
