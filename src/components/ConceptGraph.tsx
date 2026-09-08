"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { GraphEdge, GraphNode } from "@/lib/path";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const STATE_COLOR: Record<GraphNode["state"], string> = {
  locked: "#9AA3B2",
  learn: "#1A2846",
  practice: "#E09A32",
  mastered: "#2E8B6F",
};

const LINK_COLOR_LIT = "#2E8B6F";
const LINK_COLOR_DIM = "#C9C5BE";
const GRAPH_BACKGROUND = "#E7E5E1";
const LABEL_COLOR = "#1A1A1A";

const TRANSITION_MS = 600;

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Eases each node's displayed retrievability toward its real value over TRANSITION_MS, so decay reads as a fade, not a snap. */
function useAnimatedRetrievability(nodes: GraphNode[]) {
  const [display, setDisplay] = useState<Map<string, number>>(new Map());
  const displayRef = useRef(display);
  displayRef.current = display;
  const frameRef = useRef<number>(0);
  const key = nodes.map((n) => `${n.id}:${n.retrievability.toFixed(4)}`).join("|");

  useEffect(() => {
    const from = new Map(displayRef.current);
    const to = new Map(nodes.map((n) => [n.id, n.retrievability]));
    const start = performance.now();

    function tick(t: number) {
      const progress = Math.min(1, (t - start) / TRANSITION_MS);
      const next = new Map<string, number>();
      for (const [id, target] of to) {
        const startVal = from.get(id) ?? target;
        next.set(id, startVal + (target - startVal) * progress);
      }
      setDisplay(next);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return display;
}

interface ConceptGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (node: GraphNode) => void;
}

export default function ConceptGraph({ nodes, edges, onNodeClick }: ConceptGraphProps) {
  const displayRetrievability = useAnimatedRetrievability(nodes);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const graphData = {
    nodes: nodes.map((n) => ({ ...n })),
    links: edges.map((e) => ({ ...e })),
  };

  return (
    <div ref={containerRef} className="absolute inset-0">
      <ForceGraph2D
        graphData={graphData}
        width={size.width}
        height={size.height}
        backgroundColor={GRAPH_BACKGROUND}
        nodeId="id"
        nodeRelSize={4}
        nodeVal={(node) => {
          // nodeCanvasObjectMode="replace" only swaps the *visible* draw — the invisible
          // hit-detection layer still sizes itself from nodeVal/nodeRelSize, so this must
          // stay in sync with the radius drawn in nodeCanvasObject below or clicks miss.
          const n = node as unknown as GraphNode;
          const radius = 6 + n.mastery * 5;
          return (radius / 4) ** 2;
        }}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        nodeCanvasObjectMode={() => "replace"}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const n = node as unknown as GraphNode & { x?: number; y?: number };
          if (typeof n.x !== "number" || typeof n.y !== "number") return;
          const r = displayRetrievability.get(n.id) ?? n.retrievability;
          const color = STATE_COLOR[n.state];
          const radius = 6 + n.mastery * 5;

          // On a light backdrop a radial gradient-to-transparent glow has nothing dark to
          // glow into, so retrievability instead reads as opacity (faded = forgotten, full
          // = fresh) plus a soft colored shadow standing in for the glow halo.
          ctx.save();
          ctx.shadowColor = hexToRgba(color, 0.55 * r);
          ctx.shadowBlur = 16 * r;
          ctx.fillStyle = hexToRgba(color, 0.3 + 0.7 * r);
          ctx.beginPath();
          ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
          ctx.fill();
          ctx.restore();

          const fontSize = 11 / globalScale;
          ctx.font = `${fontSize}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = LABEL_COLOR;
          ctx.fillText(n.name, n.x, n.y + radius + 3);
        }}
        nodeLabel={(node) => {
          const n = node as unknown as GraphNode;
          return `${n.name} — ${Math.round(n.retrievability * 100)}% retrievability`;
        }}
        linkColor={(link) => ((link as unknown as GraphEdge).unlocked ? LINK_COLOR_LIT : LINK_COLOR_DIM)}
        linkWidth={(link) => ((link as unknown as GraphEdge).unlocked ? 2.5 : 1)}
        onNodeClick={(node) => onNodeClick?.(node as unknown as GraphNode)}
      />
    </div>
  );
}
