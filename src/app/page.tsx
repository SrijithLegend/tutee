"use client";

import { useEffect, useState } from "react";
import ConceptGraph from "@/components/ConceptGraph";
import DevBar from "@/components/DevBar";
import ConstellationDraw from "@/components/games/ConstellationDraw";
import DiagnosticQuiz from "@/components/games/DiagnosticQuiz";
import McqBattle from "@/components/games/McqBattle";
import RecallRush from "@/components/games/RecallRush";
import LessonPanel from "@/components/LessonPanel";
import TeachBack from "@/components/TeachBack";
import { DECAY_THRESHOLD, RECALL_RUSH_MIN_DECAYED, explainRecallRush } from "@/lib/scheduler";
import type { GraphEdge, GraphNode } from "@/lib/path";

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Spatial 3D game mode (Constellation Draw) vs. the safe HTML-modal fallback (McqBattle).
// Flip in .env.local; existing modal components are never removed.
const USE_SPATIAL_GAMES = process.env.NEXT_PUBLIC_SPATIAL === "1";

export default function Home() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [lessonConceptId, setLessonConceptId] = useState<string | null>(null);
  const [teachBackConceptId, setTeachBackConceptId] = useState<string | null>(null);
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
    const justLearnedConceptId = lessonConceptId;
    setLessonConceptId(null);
    // The protégé effect: right after learning something, explaining it back reinforces it further.
    setTeachBackConceptId(justLearnedConceptId);
  }

  function closeTeachBack(updatedGraph: Graph | null) {
    setTeachBackConceptId(null);
    if (updatedGraph) {
      setGraph(updatedGraph);
    } else {
      refetchGraph(); // skipped, or nothing matched — still pick up the lesson's own state change
    }
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
      <header className="flex items-center justify-between border-b border-hairline px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground font-serif text-sm italic text-background">
            t
          </span>
          <h1 className="font-serif text-lg italic tracking-tight">tutee</h1>
        </div>
        <p className="hidden text-xs uppercase tracking-[0.2em] text-muted sm:block">
          Mastery decays &middot; so does the graph
        </p>
        {graph && <DevBar onGraphUpdate={handleDevBarGraphUpdate} />}
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
            {!needsDiagnostic && !recallRushConceptIds && !lessonConceptId && teachBackConceptId && (
              <TeachBack conceptId={teachBackConceptId} onComplete={closeTeachBack} />
            )}
            {!needsDiagnostic &&
              !recallRushConceptIds &&
              !lessonConceptId &&
              !teachBackConceptId &&
              battleConceptId &&
              (USE_SPATIAL_GAMES ? (
                <ConstellationDraw conceptId={battleConceptId} onComplete={closeBattle} />
              ) : (
                <McqBattle conceptId={battleConceptId} onComplete={closeBattle} />
              ))}
          </>
        ) : (
          <p className="p-6 text-muted">Loading graph…</p>
        )}
      </main>
    </div>
  );
}
