"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ConceptGraph from "@/components/ConceptGraph";
import DevBar from "@/components/DevBar";
import ConstellationDraw from "@/components/games/ConstellationDraw";
import DecayStorm from "@/components/games/DecayStorm";
import DiagnosticQuiz from "@/components/games/DiagnosticQuiz";
import McqBattle from "@/components/games/McqBattle";
import RecallRush from "@/components/games/RecallRush";
import LessonPanel from "@/components/LessonPanel";
import TeachBack from "@/components/TeachBack";
import TeachBackOrbit from "@/components/games/TeachBackOrbit";
import { DECAY_THRESHOLD, RECALL_RUSH_MIN_DECAYED, explainRecallRush } from "@/lib/scheduler";
import type { PulseEdge } from "@/components/ConceptGraph";
import type { Lesson } from "@/components/LessonPanel";
import type { GraphEdge, GraphNode } from "@/lib/path";
import type { PublicQuestion } from "@/lib/diagnosis";

type QuestionView = PublicQuestion & { reason: string };

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Spatial 3D game mode (Constellation Draw) vs. the safe HTML-modal fallback (McqBattle).
// Flip in .env.local; existing modal components are never removed.
const USE_SPATIAL_GAMES = process.env.NEXT_PUBLIC_SPATIAL === "1";

// How long the camera gets to swoop in on a clicked star before its panel appears. The lesson/
// question fetch runs in parallel during this window, so the panel opens already populated
// instead of flashing its own "Loading..." state right after a jump cut.
const ZOOM_MS = 550;

export default function Home() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [lessonConceptId, setLessonConceptId] = useState<string | null>(null);
  const [teachBackConceptId, setTeachBackConceptId] = useState<string | null>(null);
  const [teachBackBrightness, setTeachBackBrightness] = useState(0);
  const [battleConceptId, setBattleConceptId] = useState<string | null>(null);
  const [recallRushConceptIds, setRecallRushConceptIds] = useState<string[] | null>(null);
  const [recallRushDismissed, setRecallRushDismissed] = useState(false);
  const [stormConceptId, setStormConceptId] = useState<string | null>(null);
  const [pulseEdge, setPulseEdge] = useState<PulseEdge | null>(null);
  const pulseNonceRef = useRef(0);
  const [clickFocusConceptId, setClickFocusConceptId] = useState<string | null>(null);
  const [prefetchedLesson, setPrefetchedLesson] = useState<Lesson | null>(null);
  const [prefetchedQuestion, setPrefetchedQuestion] = useState<QuestionView | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function refetchGraph() {
    fetch("/api/graph")
      .then((r) => r.json())
      .then(setGraph);
  }

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => {
        if (!r.ok) throw new Error("unauthenticated");
        return r.json();
      })
      .then((data: { username: string }) => {
        setUsername(data.username);
        refetchGraph();
      })
      .catch(() => router.push("/login"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function logOut() {
    fetch("/api/auth/logout", { method: "POST" }).then(() => router.push("/login"));
  }

  // Teach-Back, Decay Storm, and a plain star click all want to hold the galaxy camera on one
  // concept; only one is ever active at a time, so they share a single "which star is the camera
  // locked onto" slot on ConceptGraph without conflicting.
  const focusConceptId = teachBackConceptId ?? stormConceptId ?? clickFocusConceptId;

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
    if (node.state !== "learn" && node.state !== "practice" && node.state !== "mastered") return;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);

    // Fly the camera in immediately; fetch the lesson/question in parallel with that flight so
    // the panel opens already populated instead of showing its own loading flash right after.
    setClickFocusConceptId(node.id);
    setPrefetchedLesson(null);
    setPrefetchedQuestion(null);

    if (node.state === "learn") {
      fetch(`/api/lesson/${node.id}`)
        .then((r) => r.json())
        .then(setPrefetchedLesson);
      clickTimerRef.current = setTimeout(() => setLessonConceptId(node.id), ZOOM_MS);
    } else {
      fetch(`/api/answer?conceptId=${encodeURIComponent(node.id)}`)
        .then((r) => r.json())
        .then(setPrefetchedQuestion);
      clickTimerRef.current = setTimeout(() => setBattleConceptId(node.id), ZOOM_MS);
    }
  }

  function closeLesson() {
    const justLearnedConceptId = lessonConceptId;
    setLessonConceptId(null);
    setClickFocusConceptId(null);
    setPrefetchedLesson(null);
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
    setClickFocusConceptId(null);
    setPrefetchedQuestion(null);
    setGraph(updatedGraph);
  }

  function closeRecallRush() {
    setRecallRushConceptIds(null);
    setRecallRushDismissed(true);
  }

  function firePulse(edge: { source: string; target: string }) {
    pulseNonceRef.current += 1;
    setPulseEdge({ ...edge, nonce: pulseNonceRef.current });
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
        <div className="flex items-center gap-4">
          {username && (
            <span className="text-xs uppercase tracking-[0.2em] text-muted">
              {username} &middot; <button onClick={logOut} className="underline underline-offset-2">Log out</button>
            </span>
          )}
          {graph && <DevBar onGraphUpdate={handleDevBarGraphUpdate} />}
        </div>
      </header>
      <main className="relative flex-1">
        {graph ? (
          <>
            <ConceptGraph
              nodes={graph.nodes}
              edges={graph.edges}
              onNodeClick={handleNodeClick}
              stormConceptId={USE_SPATIAL_GAMES ? focusConceptId : null}
              pulseEdge={USE_SPATIAL_GAMES ? pulseEdge : null}
              rogueConceptId={USE_SPATIAL_GAMES ? teachBackConceptId : null}
              rogueBrightness={teachBackBrightness}
            />
            {needsDiagnostic && <DiagnosticQuiz onComplete={setGraph} />}
            {!needsDiagnostic &&
              recallRushConceptIds &&
              (USE_SPATIAL_GAMES ? (
                <DecayStorm
                  conceptIds={recallRushConceptIds}
                  reason={explainRecallRush(recallRushConceptIds).reason}
                  onGraphUpdate={setGraph}
                  onComplete={closeRecallRush}
                  onFocusConcept={setStormConceptId}
                  onPulse={firePulse}
                />
              ) : (
                <RecallRush
                  conceptIds={recallRushConceptIds}
                  reason={explainRecallRush(recallRushConceptIds).reason}
                  onGraphUpdate={setGraph}
                  onComplete={closeRecallRush}
                />
              ))}
            {!needsDiagnostic && !recallRushConceptIds && lessonConceptId && (
              <LessonPanel conceptId={lessonConceptId} onClose={closeLesson} initialData={prefetchedLesson} />
            )}
            {!needsDiagnostic &&
              !recallRushConceptIds &&
              !lessonConceptId &&
              teachBackConceptId &&
              (USE_SPATIAL_GAMES ? (
                <TeachBackOrbit
                  conceptId={teachBackConceptId}
                  onComplete={closeTeachBack}
                  onBrightnessChange={setTeachBackBrightness}
                />
              ) : (
                <TeachBack conceptId={teachBackConceptId} onComplete={closeTeachBack} />
              ))}
            {!needsDiagnostic &&
              !recallRushConceptIds &&
              !lessonConceptId &&
              !teachBackConceptId &&
              battleConceptId &&
              (USE_SPATIAL_GAMES ? (
                <ConstellationDraw
                  conceptId={battleConceptId}
                  onComplete={closeBattle}
                  initialQuestion={prefetchedQuestion}
                />
              ) : (
                <McqBattle conceptId={battleConceptId} onComplete={closeBattle} initialQuestion={prefetchedQuestion} />
              ))}
          </>
        ) : (
          <p className="p-6 text-muted">Loading graph…</p>
        )}
      </main>
    </div>
  );
}
