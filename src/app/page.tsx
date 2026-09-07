"use client";

import { useEffect, useState } from "react";
import ConceptGraph from "@/components/ConceptGraph";
import DevBar from "@/components/DevBar";
import DiagnosticQuiz from "@/components/games/DiagnosticQuiz";
import McqBattle from "@/components/games/McqBattle";
import LessonPanel from "@/components/LessonPanel";
import type { GraphEdge, GraphNode } from "@/lib/path";

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export default function Home() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [lessonConceptId, setLessonConceptId] = useState<string | null>(null);
  const [battleConceptId, setBattleConceptId] = useState<string | null>(null);

  function refetchGraph() {
    fetch("/api/graph")
      .then((r) => r.json())
      .then(setGraph);
  }

  useEffect(refetchGraph, []);

  const needsDiagnostic = graph != null && graph.nodes.every((n) => n.retrievability === 0);

  function handleNodeClick(node: GraphNode) {
    if (node.state === "learn") {
      setLessonConceptId(node.id);
    } else if (node.state === "practice" || node.state === "mastered") {
      setBattleConceptId(node.id);
    }
  }

  function closeLesson() {
    setLessonConceptId(null);
    refetchGraph();
  }

  function closeBattle(updatedGraph: Graph) {
    setBattleConceptId(null);
    setGraph(updatedGraph);
  }

  return (
    <div className="flex flex-col flex-1">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">tutee</h1>
        <div className="flex items-center gap-4">
          <p className="text-sm text-white/40">Mastery decays. So does the graph.</p>
          {graph && <DevBar onGraphUpdate={setGraph} />}
        </div>
      </header>
      <main className="relative flex-1">
        {graph ? (
          <>
            <ConceptGraph nodes={graph.nodes} edges={graph.edges} onNodeClick={handleNodeClick} />
            {needsDiagnostic && <DiagnosticQuiz onComplete={setGraph} />}
            {!needsDiagnostic && lessonConceptId && (
              <LessonPanel conceptId={lessonConceptId} onClose={closeLesson} />
            )}
            {!needsDiagnostic && !lessonConceptId && battleConceptId && (
              <McqBattle conceptId={battleConceptId} onComplete={closeBattle} />
            )}
          </>
        ) : (
          <p className="p-6 text-white/40">Loading graph…</p>
        )}
      </main>
    </div>
  );
}
