"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { GraphData, GraphNode } from "@/lib/api";

// react-force-graph relies on window/canvas — must be loaded client-side only.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const DANGER = "#ff5a5f";
const WARN = "#f5a623";
const BRAND = "#6c8eff";

export function GraphView({
  data,
  onSelectNode,
  highlightIds,
}: {
  data: GraphData;
  onSelectNode?: (node: GraphNode) => void;
  highlightIds?: string[];
}) {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const highlight = useMemo(() => new Set(highlightIds ?? []), [highlightIds]);

  // Measure the container and pass explicit pixel dimensions — react-force-graph otherwise
  // defaults to window size and overflows the panel.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setDims({ w: Math.floor(r.width), h: Math.floor(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graphData = useMemo(
    () => ({
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.edges.map((e) => ({ ...e })),
    }),
    [data]
  );

  // adjacency for hover-to-focus (dim everything not connected to the hovered node)
  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const add = (a: string, b: string) => {
      if (!m.has(a)) m.set(a, new Set());
      m.get(a)!.add(b);
    };
    for (const e of data.edges) {
      add(e.source, e.target);
      add(e.target, e.source);
    }
    return m;
  }, [data]);

  const isDimmed = useCallback(
    (id: string) => {
      if (hoverId) return !(id === hoverId || neighbors.get(hoverId)?.has(id));
      if (highlight.size) return !highlight.has(id);
      return false;
    },
    [hoverId, highlight, neighbors]
  );

  // When a ring is selected, zoom the camera to just its member nodes.
  useEffect(() => {
    if (highlight.size > 0 && fgRef.current) {
      const t = setTimeout(() => {
        try {
          fgRef.current.zoomToFit(600, 90, (n: any) => highlight.has(n.id));
        } catch {
          /* graph not ready */
        }
      }, 120);
      return () => clearTimeout(t);
    }
  }, [highlight]);

  const idOf = (end: any) => (typeof end === "object" ? end.id : end);

  return (
    <div
      ref={containerRef}
      className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] h-full overflow-hidden relative"
    >
      {/* ambient depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, rgba(108,142,255,0.07), transparent 60%), radial-gradient(circle at 80% 90%, rgba(255,90,95,0.05), transparent 55%)",
        }}
      />

      {/* legend */}
      <div className="absolute top-3 left-4 z-10 flex items-center gap-3.5 text-[11px] font-mono text-[var(--text-secondary)]">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: DANGER }} /> Flagged</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: WARN }} /> Injected</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: BRAND }} /> Normal</span>
      </div>

      {/* controls */}
      <div className="absolute top-3 right-3 z-10 flex gap-1.5">
        <ControlBtn label="Fit" onClick={() => fgRef.current?.zoomToFit(500, 60)} />
        <ControlBtn label="Replay" onClick={() => fgRef.current?.d3ReheatSimulation()} />
      </div>

      {/* count */}
      <div className="absolute bottom-3 left-4 z-10 text-[10px] font-mono text-[var(--text-muted)]">
        {data.nodes.length} accounts · {data.edges.length} transactions
      </div>

      <ForceGraph2D
        ref={fgRef}
        width={dims.w || undefined}
        height={dims.h || undefined}
        graphData={graphData}
        backgroundColor="transparent"
        nodeId="id"
        nodeLabel={(n: any) => `${n.name} (${n.id})`}
        nodeRelSize={4}
        onNodeHover={(n: any) => {
          setHoverId(n ? n.id : null);
          if (containerRef.current) containerRef.current.style.cursor = n ? "pointer" : "default";
        }}
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, scale: number) => {
          // Draw at a constant SCREEN size (divide graph-unit values by the zoom scale),
          // otherwise nodes become sub-pixel when the whole graph is fit into view.
          const px = (v: number) => v / scale;
          const dimmed = isDimmed(node.id);
          const sel = highlight.has(node.id);
          const color = node.flagged ? DANGER : node.injected ? WARN : BRAND;
          const screenR = (node.flagged || node.injected ? 4.6 : 3.2) + (sel ? 2 : 0);
          const r = px(screenR);

          ctx.globalAlpha = dimmed ? 0.12 : 1;

          if ((node.flagged || node.injected || sel || node.id === hoverId) && !dimmed) {
            ctx.shadowColor = color;
            ctx.shadowBlur = px(sel ? 16 : 9);
          }
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.shadowBlur = 0;

          // thin dark outline for separation
          ctx.lineWidth = px(0.6);
          ctx.strokeStyle = "rgba(10,13,18,0.9)";
          ctx.stroke();

          if (sel && !dimmed) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + px(3.5), 0, 2 * Math.PI);
            ctx.strokeStyle = "rgba(255,90,95,0.85)";
            ctx.lineWidth = px(1.2);
            ctx.stroke();
          }

          // conditional labels: keep the canvas readable, not cluttered
          const showLabel =
            !dimmed &&
            (sel || node.id === hoverId || (hoverId && neighbors.get(hoverId)?.has(node.id)) || scale > 2.6);
          if (showLabel) {
            ctx.font = `${px(11)}px 'JetBrains Mono', monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = "rgba(232,234,237,0.92)";
            ctx.fillText(node.id, node.x, node.y + r + px(2));
          }
          ctx.globalAlpha = 1;
        }}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D, scale: number) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, (node.flagged || node.injected ? 6 : 5) / scale, 0, 2 * Math.PI);
          ctx.fill();
        }}
        linkColor={(l: any) => {
          const sid = idOf(l.source), tid = idOf(l.target);
          if (hoverId) return sid === hoverId || tid === hoverId ? "rgba(108,142,255,0.55)" : "rgba(255,255,255,0.02)";
          const bothFlagged = l.source?.flagged && l.target?.flagged;
          if (highlight.size) return highlight.has(sid) && highlight.has(tid) ? "rgba(255,90,95,0.4)" : "rgba(255,255,255,0.02)";
          return bothFlagged ? "rgba(255,90,95,0.28)" : "rgba(130,150,210,0.09)";
        }}
        linkWidth={(l: any) => (l.source?.flagged && l.target?.flagged ? 1.3 : 0.5)}
        linkDirectionalParticles={(l: any) =>
          l.source?.flagged && l.target?.flagged && !hoverId ? 2 : 0
        }
        linkDirectionalParticleWidth={1.8}
        linkDirectionalParticleSpeed={0.006}
        linkDirectionalParticleColor={() => "#ff8a8f"}
        onNodeClick={(n: any) => onSelectNode?.(n)}
        warmupTicks={30}
        cooldownTicks={90}
        onEngineStop={() => fgRef.current?.zoomToFit(400, 50)}
      />
    </div>
  );
}

function ControlBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-panel-raised)]/80 border border-[var(--border-hairline)] rounded px-2 py-1 transition-colors backdrop-blur-sm"
    >
      {label}
    </button>
  );
}
