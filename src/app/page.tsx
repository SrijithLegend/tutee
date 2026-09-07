"use client";

import { useEffect, useState } from "react";
import ConceptGraph from "@/components/ConceptGraph";
import type { GraphEdge, GraphNode } from "@/lib/path";

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export default function Home() {
  const [graph, setGraph] = useState<Graph | null>(null);

  useEffect(() => {
    fetch("/api/graph")
      .then((r) => r.json())
      .then(setGraph);
  }, []);

  return (
    <div className="flex flex-col flex-1">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">tutee</h1>
        <p className="text-sm text-white/40">Mastery decays. So does the graph.</p>
      </header>
      <main className="flex-1">
        {graph ? (
          <ConceptGraph nodes={graph.nodes} edges={graph.edges} />
        ) : (
          <p className="p-6 text-white/40">Loading graph…</p>
        )}
      </main>
    </div>
  );
}
