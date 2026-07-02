"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type GraphData, type GraphNode, type Ring, type Stats } from "@/lib/api";
import { useLiveFeed } from "@/lib/useLiveFeed";
import { StatCard } from "@/components/StatCard";
import { LiveFeed } from "@/components/LiveFeed";
import { Controls } from "@/components/Controls";
import { RingsPanel } from "@/components/RingsPanel";
import { GraphView } from "@/components/GraphView";
import { NodeDetail } from "@/components/NodeDetail";
import { BenchmarkModal } from "@/components/BenchmarkModal";
import { InvestigateModal } from "@/components/InvestigateModal";
import { CopilotModal } from "@/components/CopilotModal";

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [rings, setRings] = useState<Ring[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [showInvestigate, setShowInvestigate] = useState(false);
  const [showCopilot, setShowCopilot] = useState(false);

  const refreshAll = useCallback(async () => {
    try {
      const [statsData, graphData, ringsData] = await Promise.all([
        api.stats(),
        api.graph(),
        api.rings(),
      ]);
      setStats(statsData);
      setGraph(graphData);
      setRings(ringsData);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to reach the Kavach backend.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const { connected, events } = useLiveFeed((evt) => {
    // refresh graph/stats/rings whenever something meaningful happens
    if (evt.type === "ring_injected" || evt.type === "detection_complete") {
      refreshAll();
    } else if (evt.type === "stats_update") {
      setStats(evt.payload);
    }
  });

  const handleDetect = async () => {
    await api.detect();
    await refreshAll();
  };

  const handleInject = async () => {
    await api.injectFraudRing(6);
    await refreshAll();
  };

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--border-hairline)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-[var(--accent-brand)]/15 border border-[var(--accent-brand)]/30 flex items-center justify-center">
            <ShieldIcon />
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight leading-none">
              KAVACH
            </h1>
            <p className="text-[10px] text-[var(--text-muted)] font-mono tracking-wide">
              GRAPH-NATIVE FRAUD RING DETECTION
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCopilot(true)}
            className="px-4 py-2 rounded-md border border-[var(--accent-brand)]/40 bg-[var(--accent-brand)]/10 text-[var(--accent-brand)] text-sm font-medium hover:bg-[var(--accent-brand)]/20 transition-colors"
          >
            ✦ Ask Copilot
          </button>
          <button
            onClick={() => setShowInvestigate(true)}
            className="px-4 py-2 rounded-md border border-[var(--border-hairline-strong)] bg-[var(--bg-panel-raised)] text-[var(--text-secondary)] text-sm font-medium hover:text-[var(--text-primary)] hover:border-[var(--accent-brand)]/40 transition-colors"
          >
            Investigate
          </button>
          <button
            onClick={() => setShowBenchmark(true)}
            className="px-4 py-2 rounded-md border border-[var(--border-hairline-strong)] bg-[var(--bg-panel-raised)] text-[var(--text-secondary)] text-sm font-medium hover:text-[var(--text-primary)] hover:border-[var(--accent-brand)]/40 transition-colors"
          >
            Why Graph?
          </button>
          <Controls onDetect={handleDetect} onInject={handleInject} />
        </div>
      </header>

      {showBenchmark && <BenchmarkModal onClose={() => setShowBenchmark(false)} />}
      {showInvestigate && <InvestigateModal onClose={() => setShowInvestigate(false)} />}
      {showCopilot && <CopilotModal onClose={() => setShowCopilot(false)} />}

      {error && (
        <div className="mx-6 mt-4 rounded-md border border-[var(--accent-danger)]/40 bg-[var(--accent-danger-dim)]/50 px-4 py-3 text-sm text-[var(--accent-danger)]">
          {error} — make sure the backend is running on <code className="font-mono">NEXT_PUBLIC_API_URL</code> and
          Neo4j credentials are set in <code className="font-mono">backend/.env</code>.
        </div>
      )}

      {/* Stats row */}
      <div className="px-6 pt-5 flex gap-3 flex-wrap">
        <StatCard eyebrow="Total" label="Accounts" value={stats?.accounts ?? "—"} accent="brand" />
        <StatCard eyebrow="Total" label="Transactions" value={stats?.transactions ?? "—"} accent="brand" />
        <StatCard eyebrow="Detected" label="Fraud Rings" value={stats?.rings ?? "—"} accent="danger" />
        <StatCard eyebrow="Flagged" label="Accounts in Rings" value={stats?.flaggedAccounts ?? "—"} accent="danger" />
      </div>

      {/* Main grid */}
      <div className="flex-1 px-6 py-5 grid grid-cols-1 lg:grid-cols-[220px_1fr_320px] gap-4 min-h-[600px]">
        <div className="order-2 lg:order-1">
          <LiveFeed events={events} connected={connected} />
        </div>

        <div className="order-1 lg:order-2 flex flex-col gap-4">
          <div className="flex-1 min-h-[420px]">
            {loading ? (
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
                Loading graph…
              </div>
            ) : (
              <GraphView data={graph} onSelectNode={setSelectedNode} />
            )}
          </div>
          {selectedNode && <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />}
        </div>

        <div className="order-3">
          <RingsPanel rings={rings} />
        </div>
      </div>
    </main>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-brand)" strokeWidth="2">
      <path d="M12 2 4 5v6c0 5.25 3.5 9.75 8 11 4.5-1.25 8-5.75 8-11V5l-8-3Z" />
    </svg>
  );
}
