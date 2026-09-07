"use client";

import type { GraphEdge, GraphNode } from "@/lib/path";

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface DevBarProps {
  onGraphUpdate: (graph: Graph) => void;
}

export default function DevBar({ onGraphUpdate }: DevBarProps) {
  function simulate() {
    fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: 7 }),
    })
      .then((r) => r.json())
      .then(onGraphUpdate);
  }

  return (
    <button
      onClick={simulate}
      className="rounded border border-white/10 px-3 py-1.5 text-sm text-white/70 transition-colors hover:border-white/30 hover:bg-white/5"
    >
      Simulate 7 days
    </button>
  );
}
