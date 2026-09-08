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
  function post(url: string) {
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: 7 }) })
      .then((r) => r.json())
      .then(onGraphUpdate);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => post("/api/simulate")}
        className="rounded border border-hairline px-3 py-1.5 text-xs uppercase tracking-wide text-muted transition-colors hover:border-foreground/40 hover:bg-black/5"
      >
        Simulate 7 days
      </button>
      <button
        onClick={() => post("/api/reset")}
        className="rounded border border-hairline px-3 py-1.5 text-xs uppercase tracking-wide text-muted transition-colors hover:border-[#E09A32]/60 hover:bg-[#E09A32]/10"
      >
        Reset
      </button>
    </div>
  );
}
