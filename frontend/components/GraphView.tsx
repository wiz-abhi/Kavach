"use client";

import { useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import type { GraphData, GraphNode } from "@/lib/api";

// react-force-graph relies on window/canvas — must be loaded client-side only.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

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
  const highlight = useMemo(() => new Set(highlightIds ?? []), [highlightIds]);

  const graphData = useMemo(
    () => ({
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.edges.map((e) => ({ ...e })),
    }),
    [data]
  );

  // When a ring is selected, zoom the camera to just its member nodes.
  useEffect(() => {
    if (highlight.size > 0 && fgRef.current) {
      const t = setTimeout(() => {
        try {
          fgRef.current.zoomToFit(600, 80, (n: any) => highlight.has(n.id));
        } catch {
          /* graph not ready */
        }
      }, 100);
      return () => clearTimeout(t);
    }
  }, [highlight]);

  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] h-full overflow-hidden relative">
      <div className="absolute top-3 left-4 z-10 flex items-center gap-4 text-xs font-mono">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-danger)]" /> Flagged
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-brand)]" /> Normal
        </span>
      </div>
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        backgroundColor="transparent"
        nodeId="id"
        nodeLabel={(n: any) => `${n.name} (${n.id})`}
        nodeColor={(n: any) => (n.flagged ? "#ff5a5f" : n.injected ? "#f5a623" : "#6c8eff")}
        nodeRelSize={4}
        nodeVal={(n: any) => (highlight.has(n.id) ? 6 : 1)}
        nodeCanvasObjectMode={(n: any) => (highlight.has(n.id) ? "before" : undefined)}
        nodeCanvasObject={(n: any, ctx: CanvasRenderingContext2D) => {
          // draw a halo ring around highlighted (selected-ring) members
          if (!highlight.has(n.id)) return;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 9, 0, 2 * Math.PI);
          ctx.strokeStyle = "rgba(255,90,95,0.9)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }}
        linkColor={() => "rgba(255,255,255,0.08)"}
        linkWidth={0.6}
        onNodeClick={(n: any) => onSelectNode?.(n)}
        cooldownTicks={80}
        onEngineStop={() => fgRef.current?.zoomToFit(400, 40)}
      />
    </div>
  );
}
