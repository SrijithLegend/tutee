"use client";

import { useEffect, useRef, useState } from "react";
import ExplainPanel from "@/components/ExplainPanel";
import DragSequence from "@/components/games/DragSequence";
import type { GraphEdge, GraphNode } from "@/lib/path";
import type { PublicQuestion } from "@/lib/diagnosis";

type QuestionView = PublicQuestion & { reason: string };

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface AnswerResponse {
  correct: boolean;
  graph: Graph;
}

const ROUND_SECONDS = 45;

interface DecayStormProps {
  conceptIds: string[];
  reason: string;
  onGraphUpdate: (graph: Graph) => void;
  onComplete: () => void;
  /** Told which concept's star the galaxy camera should fly to and hold on; null when the storm ends. */
  onFocusConcept: (conceptId: string | null) => void;
  /** Fired once per downstream edge when an answer is correct, to animate a light pulse along it. */
  onPulse: (edge: { source: string; target: string }) => void;
}

/** Decay Storm: the same rapid-fire recall round as Recall Rush, but staged as a live event inside
 * the galaxy itself — the camera holds on the concept in play while the rest of the graph visibly
 * cools, instead of a centered modal blocking it out. */
export default function DecayStorm({
  conceptIds,
  reason,
  onGraphUpdate,
  onComplete,
  onFocusConcept,
  onPulse,
}: DecayStormProps) {
  const [index, setIndex] = useState(0);
  const [question, setQuestion] = useState<QuestionView | null>(null);
  const [questionStart, setQuestionStart] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const finishedRef = useRef(false);

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFocusConcept(null);
    onComplete();
  }

  function advance(graph: Graph) {
    onGraphUpdate(graph);
    setIndex((i) => i + 1);
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          finish();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (index >= conceptIds.length) {
      finish();
      return;
    }
    const conceptId = conceptIds[index];
    onFocusConcept(conceptId);
    fetch(`/api/answer?conceptId=${encodeURIComponent(conceptId)}`)
      .then((r) => r.json())
      .then((q: QuestionView) => {
        setQuestion(q);
        setQuestionStart(Date.now());
        setFeedback(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  function selectOption(optionId: string) {
    if (!question) return;
    const conceptId = conceptIds[index];
    const responseMs = Date.now() - questionStart;
    fetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: question.id, optionId, responseMs }),
    })
      .then((r) => r.json())
      .then((result: AnswerResponse) => {
        onGraphUpdate(result.graph);
        setFeedback(result.correct ? "correct" : "incorrect");
        if (result.correct) {
          for (const edge of result.graph.edges) {
            if (edge.source === conceptId) onPulse({ source: edge.source, target: edge.target });
          }
        }
        setTimeout(() => setIndex((i) => i + 1), 700);
      });
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
      <div className="pointer-events-auto w-full max-w-lg rounded-sm border border-[#E09A32]/50 bg-card/95 p-6 shadow-xl">
        <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-[0.2em]">
          <span className="font-semibold text-[#b8791f]">Decay Storm</span>
          <span className="text-muted">
            {secondsLeft}s &middot; {Math.min(index + 1, conceptIds.length)}/{conceptIds.length}
          </span>
        </div>
        <ExplainPanel reason={reason} />
        {!question ? (
          <p className="text-muted">Loading&hellip;</p>
        ) : question.gameType === "sequence" ? (
          <DragSequence question={question} onComplete={advance} />
        ) : feedback ? (
          <p className={`text-lg font-medium ${feedback === "correct" ? "text-[#2E8B6F]" : "text-[#b8791f]"}`}>
            {feedback === "correct" ? "Correct! Light pulses down the graph." : "Not quite."}
          </p>
        ) : (
          <>
            <h2 className="mb-4 font-serif text-xl italic">{question.prompt}</h2>
            <div className="flex flex-col gap-2">
              {question.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => selectOption(option.id)}
                  className="rounded-sm border border-hairline px-4 py-2 text-left transition-colors hover:border-foreground/40 hover:bg-black/5"
                >
                  {option.text}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
