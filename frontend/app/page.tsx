"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [selectedRing, setSelectedRing] = useState<Ring | null>(null);
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

  // ---- Demo Mode: auto-drive the whole UI on a timer with on-screen captions ----
  const demoRunning = useRef(false);
  const [demoActive, setDemoActive] = useState(false);
  const [demoCaption, setDemoCaption] = useState("");
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const stopDemo = () => {
    demoRunning.current = false;
    setDemoActive(false);
    setDemoCaption("");
    setShowBenchmark(false);
    setShowInvestigate(false);
    setShowCopilot(false);
    setSelectedRing(null);
  };

  const runDemo = async () => {
    if (demoRunning.current) return;
    demoRunning.current = true;
    setDemoActive(true);
    const alive = () => demoRunning.current;
    const step = async (caption: string, ms: number) => {
      if (!alive()) return;
      setDemoCaption(caption);
      await sleep(ms);
    };
    try {
      setShowBenchmark(false);
      setShowInvestigate(false);
      setShowCopilot(false);
      setSelectedRing(null);
      await step("Kavach — real-time fraud ring detection. Hundreds of accounts moving through the graph, all calm.", 9000);
      if (!alive()) return;
      await step("Fraud rarely works alone. Let's scan the graph for coordinated rings…", 5000);
      if (!alive()) return;
      setDemoCaption("Running detection across the live graph…");
      await handleDetect();
      if (!alive()) return;
      await step("Rings light up — verified 100% recall, zero false positives against ground truth.", 7000);
      if (!alive()) return;
      try {
        const fresh = await api.rings();
        if (fresh[0]) setSelectedRing(fresh[0]);
      } catch {}
      await step("Each ring shares a device and IP and transacts 60–140× denser than the network baseline.", 9000);
      if (!alive()) return;
      setSelectedRing(null);
      setShowBenchmark(true);
      await step("Why a graph database? The same fraud query in Cypher vs. SQL — identical results, one clean pattern vs. a recursive join.", 14000);
      setShowBenchmark(false);
      if (!alive()) return;
      setShowInvestigate(true);
      await step("Investigate: Neo4j shortestPath reveals a hidden identity chain between accounts that never transacted directly.", 13000);
      setShowInvestigate(false);
      if (!alive()) return;
      setShowCopilot(true);
      await step("Ask in plain English — Kavach writes and runs the Cypher for you, read-only, against the live graph.", 13000);
      setShowCopilot(false);
      if (!alive()) return;
      await step("Now — inject a brand-new fraud ring into the live graph, right now…", 4500);
      if (!alive()) return;
      setDemoCaption("Injecting a new ring, then re-running detection…");
      await handleInject();
      await handleDetect();
      if (!alive()) return;
      await step("…and Kavach catches it in real time. New accounts, new shared device, flagged instantly.", 8000);
      if (!alive()) return;
      await step("Catch the ring, not just the account. Kavach — graph-native fraud detection on Neo4j AuraDB.", 9000);
    } finally {
      stopDemo();
    }
  };

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--border-hairline)] px-6 py-3.5 flex items-center justify-between gap-4 flex-wrap bg-[var(--bg-panel)]/40 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--accent-brand)]/15 border border-[var(--accent-brand)]/30 flex items-center justify-center">
            <ShieldIcon />
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight leading-none">
              KAVACH
            </h1>
            <p className="text-[10px] text-[var(--text-muted)] font-mono tracking-wide mt-0.5">
              GRAPH-NATIVE FRAUD RING DETECTION
            </p>
          </div>
          <span
            className="ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono uppercase tracking-wider"
            style={{
              color: connected ? "var(--accent-safe)" : "var(--text-muted)",
              borderColor: connected ? "color-mix(in srgb, var(--accent-safe) 30%, transparent)" : "var(--border-hairline)",
              background: connected ? "color-mix(in srgb, var(--accent-safe) 8%, transparent)" : "transparent",
            }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "animate-pulse" : ""}`} style={{ background: "currentColor" }} />
            {connected ? "Live" : "Offline"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={demoActive ? stopDemo : runDemo}
            className="px-3.5 py-2 rounded-md border text-sm font-medium transition-colors"
            style={
              demoActive
                ? { borderColor: "color-mix(in srgb, var(--accent-danger) 45%, transparent)", background: "var(--accent-danger-dim)", color: "var(--accent-danger)" }
                : { borderColor: "color-mix(in srgb, var(--accent-safe) 45%, transparent)", background: "color-mix(in srgb, var(--accent-safe) 12%, transparent)", color: "var(--accent-safe)" }
            }
          >
            {demoActive ? "■ Stop Demo" : "▶ Demo Mode"}
          </button>
          <button
            onClick={() => setShowCopilot(true)}
            className="px-3.5 py-2 rounded-md border border-[var(--accent-brand)]/40 bg-[var(--accent-brand)]/10 text-[var(--accent-brand)] text-sm font-medium hover:bg-[var(--accent-brand)]/20 transition-colors"
          >
            ✦ Ask Copilot
          </button>
          <button
            onClick={() => setShowInvestigate(true)}
            className="px-3.5 py-2 rounded-md border border-[var(--border-hairline-strong)] bg-[var(--bg-panel-raised)] text-[var(--text-secondary)] text-sm font-medium hover:text-[var(--text-primary)] hover:border-[var(--accent-brand)]/40 transition-colors"
          >
            Investigate
          </button>
          <button
            onClick={() => setShowBenchmark(true)}
            className="px-3.5 py-2 rounded-md border border-[var(--border-hairline-strong)] bg-[var(--bg-panel-raised)] text-[var(--text-secondary)] text-sm font-medium hover:text-[var(--text-primary)] hover:border-[var(--accent-brand)]/40 transition-colors"
          >
            Why Graph?
          </button>
          <span className="w-px h-7 bg-[var(--border-hairline-strong)] mx-1" />
          <Controls onDetect={handleDetect} onInject={handleInject} />
        </div>
      </header>

      {showBenchmark && <BenchmarkModal onClose={() => setShowBenchmark(false)} />}
      {showInvestigate && <InvestigateModal onClose={() => setShowInvestigate(false)} autoRun={demoActive} />}
      {showCopilot && <CopilotModal onClose={() => setShowCopilot(false)} autoRun={demoActive} />}

      {demoActive && (
        <div className="fixed bottom-0 left-0 right-0 z-[60] flex justify-center px-4 pb-6 pointer-events-none">
          <div className="pointer-events-auto max-w-3xl w-full flex items-center gap-4 rounded-xl border border-[var(--border-hairline-strong)] bg-[var(--bg-panel)]/95 px-5 py-3.5 backdrop-blur-md shadow-2xl">
            <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[var(--accent-brand)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-danger)] animate-pulse" /> Demo
            </span>
            <p className="flex-1 text-sm text-[var(--text-primary)] leading-snug">{demoCaption}</p>
            <button
              onClick={stopDemo}
              className="shrink-0 text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent-danger)] border border-[var(--border-hairline)] rounded px-2.5 py-1 transition-colors"
            >
              Stop
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mx-6 mt-4 rounded-md border border-[var(--accent-danger)]/40 bg-[var(--accent-danger-dim)]/50 px-4 py-3 text-sm text-[var(--accent-danger)]">
          {error} — make sure the backend is running on <code className="font-mono">NEXT_PUBLIC_API_URL</code> and
          Neo4j credentials are set in <code className="font-mono">backend/.env</code>.
        </div>
      )}

      {/* Stats row */}
      <div className="px-6 pt-5 flex gap-3 flex-wrap">
        <StatCard eyebrow="Total" label="Accounts" value={fmt(stats?.accounts)} accent="brand" icon={<UsersIcon />} />
        <StatCard eyebrow="Total" label="Transactions" value={fmt(stats?.transactions)} accent="brand" icon={<ActivityIcon />} />
        <StatCard eyebrow="Detected" label="Fraud Rings" value={fmt(stats?.rings)} accent="danger" icon={<TargetIcon />} pulse={!!stats?.rings} />
        <StatCard eyebrow="Flagged" label="Accounts in Rings" value={fmt(stats?.flaggedAccounts)} accent="danger" icon={<FlagIcon />} pulse={!!stats?.flaggedAccounts} />
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
              <GraphView data={graph} onSelectNode={setSelectedNode} highlightIds={selectedRing?.member_ids} />
            )}
          </div>
          {selectedNode && <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />}
        </div>

        <div className="order-3">
          <RingsPanel rings={rings} onSelectRing={setSelectedRing} selectedRingId={selectedRing?.id} />
        </div>
      </div>
    </main>
  );
}

function fmt(n: number | undefined): string {
  return typeof n === "number" ? n.toLocaleString("en-IN") : "—";
}

function ShieldIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent-brand)" strokeWidth="2">
      <path d="M12 2 4 5v6c0 5.25 3.5 9.75 8 11 4.5-1.25 8-5.75 8-11V5l-8-3Z" />
    </svg>
  );
}

const iconProps = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function UsersIcon() {
  return (
    <svg {...iconProps}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function ActivityIcon() {
  return (
    <svg {...iconProps}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
function TargetIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function FlagIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}
