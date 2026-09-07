"use client";

import { useEffect, useState } from "react";
import ConceptGraph from "@/components/ConceptGraph";
import DevBar from "@/components/DevBar";
import DiagnosticQuiz from "@/components/games/DiagnosticQuiz";
import McqBattle from "@/components/games/McqBattle";
import RecallRush from "@/components/games/RecallRush";
import LessonPanel from "@/components/LessonPanel";
import { DECAY_THRESHOLD, RECALL_RUSH_MIN_DECAYED, explainRecallRush } from "@/lib/scheduler";
import type { GraphEdge, GraphNode } from "@/lib/path";

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export default function Home() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [lessonConceptId, setLessonConceptId] = useState<string | null>(null);
  const [battleConceptId, setBattleConceptId] = useState<string | null>(null);
  const [recallRushConceptIds, setRecallRushConceptIds] = useState<string[] | null>(null);
  const [recallRushDismissed, setRecallRushDismissed] = useState(false);

  function refetchGraph() {
    fetch("/api/graph")
      .then((r) => r.json())
      .then(setGraph);
  }

  useEffect(refetchGraph, []);

  const needsDiagnostic = graph != null && graph.nodes.every((n) => n.retrievability === 0);

  // Auto-fire: locks in the decayed concept list once, so answering one of them mid-round
  // (raising its retrievability back up) can't shrink the list out from under an active round.
  useEffect(() => {
    if (!graph || needsDiagnostic || recallRushDismissed || recallRushConceptIds) return;
    const decayed = graph.nodes.filter((n) => n.retrievability < DECAY_THRESHOLD).map((n) => n.id);
    if (decayed.length >= RECALL_RUSH_MIN_DECAYED) {
      setRecallRushConceptIds(decayed);
    }
  }, [graph, needsDiagnostic, recallRushDismissed, recallRushConceptIds]);

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

  function closeRecallRush() {
    setRecallRushConceptIds(null);
    setRecallRushDismissed(true);
  }

  // A fresh decay event (e.g. Simulate 7 days) should be allowed to trigger Recall Rush again.
  function handleDevBarGraphUpdate(updatedGraph: Graph) {
    setRecallRushDismissed(false);
    setGraph(updatedGraph);
  }

  return (
    <div className="flex flex-col flex-1">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">tutee</h1>
        <div className="flex items-center gap-4">
          <p className="text-sm text-white/40">Mastery decays. So does the graph.</p>
          {graph && <DevBar onGraphUpdate={handleDevBarGraphUpdate} />}
        </div>
      </header>
      <main className="relative flex-1">
        {graph ? (
          <>
            <ConceptGraph nodes={graph.nodes} edges={graph.edges} onNodeClick={handleNodeClick} />
            {needsDiagnostic && <DiagnosticQuiz onComplete={setGraph} />}
            {!needsDiagnostic && recallRushConceptIds && (
              <RecallRush
                conceptIds={recallRushConceptIds}
                reason={explainRecallRush(recallRushConceptIds).reason}
                onGraphUpdate={setGraph}
                onComplete={closeRecallRush}
              />
            )}
            {!needsDiagnostic && !recallRushConceptIds && lessonConceptId && (
              <LessonPanel conceptId={lessonConceptId} onClose={closeLesson} />
            )}
            {!needsDiagnostic && !recallRushConceptIds && !lessonConceptId && battleConceptId && (
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
