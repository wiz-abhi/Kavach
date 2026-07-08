"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { forceCollide, forceX, forceY } from "d3-force";
import type { GraphData, GraphNode } from "@/lib/api";

// react-force-graph relies on window/canvas — must be loaded client-side only.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const DANGER = "#ff5a5f";
const WARN = "#f5a623";
const BRAND = "#6c8eff";

// Hard-clamp every node within a disk of the given radius around the origin, so disconnected
// clusters can never be flung far off-frame — the whole graph stays a compact, centered blob.
function boundingForce(radius: number) {
  let nodes: any[] = [];
  const force = () => {
    for (const n of nodes) {
      const d = Math.hypot(n.x ?? 0, n.y ?? 0);
      if (d > radius) {
        const k = radius / d;
        n.x *= k;
        n.y *= k;
        n.vx = (n.vx ?? 0) * 0.4;
        n.vy = (n.vy ?? 0) * 0.4;
      }
    }
  };
  (force as any).initialize = (n: any[]) => {
    nodes = n;
  };
  return force;
}

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
  // Cache node positions so a data refresh (e.g. after detection) doesn't re-scramble the
  // whole layout — nodes stay put and simply recolor. New nodes (injected rings) fly in.
  const posCache = useRef<Map<string, { x: number; y: number }>>(new Map());
  // Auto-fit the camera on each settle until the user takes control (pan/zoom/drag),
  // so drifting clusters never end up clipped at the frame edge.
  const userMoved = useRef(false);

  // Measure the container and pass explicit pixel dimensions — react-force-graph otherwise
  // defaults to window size and overflows the panel.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (w > 0 && h > 0) setDims((d) => (d.w === w && d.h === h ? d : { w, h }));
    };
    measure(); // synchronous post-paint read (container height is resolved by now)
    const raf = requestAnimationFrame(measure); // retry next frame in case layout settles late
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const graphData = useMemo(
    () => ({
      nodes: data.nodes.map((n) => {
        const p = posCache.current.get(n.id);
        // seed known positions so the layout stays put across refreshes
        return p ? { ...n, x: p.x, y: p.y, vx: 0, vy: 0 } : { ...n };
      }),
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

  // Tune the physics: a collision force declutters the dense core so nodes don't overlap,
  // and a gentle centering pull keeps disconnected ring clusters from drifting far off-screen.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || dims.w === 0) return;
    const charge = fg.d3Force("charge");
    if (charge) charge.strength(-26).distanceMax(180);
    const link = fg.d3Force("link");
    if (link) link.distance(22).strength(0.4);
    fg.d3Force("collide", forceCollide(7));
    fg.d3Force("x", forceX(0).strength(0.045));
    fg.d3Force("y", forceY(0).strength(0.045));
    // hard containment: nothing can drift beyond this radius, so the fit stays compact
    fg.d3Force("bound", boundingForce(240));
    fg.d3ReheatSimulation();
  }, [dims.w, dims.h, data]);

  // The simulation can "stop" before disconnected clusters finish drifting into place, so a
  // single fit-on-settle sometimes leaves them out of frame (only corrected by a resize).
  // Re-fit a few times as the layout converges after load / data change — until the user
  // takes control of the camera.
  useEffect(() => {
    if (userMoved.current) return;
    const fit = () => {
      if (!userMoved.current) fgRef.current?.zoomToFit(500, 60);
    };
    const timers = [500, 1400, 2800, 4500].map((ms) => setTimeout(fit, ms));
    return () => timers.forEach(clearTimeout);
  }, [data, dims.w, dims.h]);

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
      onWheelCapture={() => {
        userMoved.current = true;
      }}
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
        <ControlBtn
          label="Fit"
          onClick={() => {
            userMoved.current = false;
            fgRef.current?.zoomToFit(500, 60);
          }}
        />
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
          const emph = node.flagged || node.injected || sel || node.id === hoverId;
          const color = node.flagged ? DANGER : node.injected ? WARN : BRAND;
          const screenR = (node.flagged || node.injected ? 5 : 3.6) + (sel ? 2 : 0);
          const r = px(screenR);

          ctx.globalAlpha = dimmed ? 0.1 : 1;

          // glow only emphasized nodes (flagged/injected/hover/selected) — keeps 400+ normal
          // nodes cheap to paint so interaction stays smooth; rim-light gives the rest depth
          if (emph && !dimmed) {
            ctx.shadowColor = color;
            ctx.shadowBlur = px(sel ? 18 : 12);
          }
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.shadowBlur = 0;

          // bright rim-light for depth (turns flat dots into orbs)
          if (!dimmed) {
            ctx.lineWidth = px(0.9);
            ctx.strokeStyle = node.flagged
              ? "rgba(255,185,185,0.95)"
              : node.injected
              ? "rgba(255,220,155,0.95)"
              : "rgba(185,205,255,0.7)";
            ctx.stroke();
          }

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
        minZoom={0.4}
        maxZoom={8}
        linkColor={(l: any) => {
          const sid = idOf(l.source), tid = idOf(l.target);
          if (hoverId) return sid === hoverId || tid === hoverId ? "rgba(108,142,255,0.6)" : "rgba(255,255,255,0.015)";
          const bothFlagged = l.source?.flagged && l.target?.flagged;
          if (highlight.size) return highlight.has(sid) && highlight.has(tid) ? "rgba(255,90,95,0.45)" : "rgba(255,255,255,0.02)";
          return bothFlagged ? "rgba(255,110,115,0.35)" : "rgba(140,160,225,0.13)";
        }}
        linkWidth={(l: any) => (l.source?.flagged && l.target?.flagged ? 1.4 : 0.6)}
        linkDirectionalParticles={(l: any) =>
          l.source?.flagged && l.target?.flagged && !hoverId ? 2 : 0
        }
        linkDirectionalParticleWidth={1.8}
        linkDirectionalParticleSpeed={0.006}
        linkDirectionalParticleColor={() => "#ff8a8f"}
        onNodeClick={(n: any) => onSelectNode?.(n)}
        warmupTicks={30}
        cooldownTicks={90}
        onEngineTick={() => {
          for (const n of graphData.nodes as any[]) {
            if (n.x != null && n.y != null) posCache.current.set(n.id, { x: n.x, y: n.y });
          }
        }}
        onNodeDrag={() => {
          userMoved.current = true;
        }}
        onEngineStop={() => {
          for (const n of graphData.nodes as any[]) {
            if (n.x != null && n.y != null) posCache.current.set(n.id, { x: n.x, y: n.y });
          }
          // Keep everything framed on each settle — but stop once the user has taken
          // control of the camera, so we don't yank their view.
          if (!userMoved.current) fgRef.current?.zoomToFit(500, 60);
        }}
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
