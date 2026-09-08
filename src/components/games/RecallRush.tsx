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

interface RecallRushProps {
  conceptIds: string[];
  reason: string;
  onGraphUpdate: (graph: Graph) => void;
  onComplete: () => void;
}

const ROUND_SECONDS = 45;

export default function RecallRush({ conceptIds, reason, onGraphUpdate, onComplete }: RecallRushProps) {
  const [index, setIndex] = useState(0);
  const [question, setQuestion] = useState<QuestionView | null>(null);
  const [questionStart, setQuestionStart] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const finishedRef = useRef(false);

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onComplete();
  }

  function advance(graph: Graph) {
    onGraphUpdate(graph); // re-glow immediately, mid-round
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
    fetch(`/api/answer?conceptId=${encodeURIComponent(conceptIds[index])}`)
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
        setTimeout(() => setIndex((i) => i + 1), 700);
      });
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-lg rounded-lg border border-[#E09A32]/40 bg-[#11151f] p-6">
        <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide">
          <span className="font-semibold text-[#E09A32]">Recall Rush</span>
          <span className="text-white/50">
            {secondsLeft}s · {Math.min(index + 1, conceptIds.length)}/{conceptIds.length}
          </span>
        </div>
        <ExplainPanel reason={reason} />
        {!question ? (
          <p className="text-white/60">Loading…</p>
        ) : question.gameType === "sequence" ? (
          <DragSequence question={question} onComplete={advance} />
        ) : feedback ? (
          <p className={`text-lg font-medium ${feedback === "correct" ? "text-[#2E8B6F]" : "text-[#E09A32]"}`}>
            {feedback === "correct" ? "Correct!" : "Not quite."}
          </p>
        ) : (
          <>
            <h2 className="mb-4 text-lg font-medium">{question.prompt}</h2>
            <div className="flex flex-col gap-2">
              {question.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => selectOption(option.id)}
                  className="rounded border border-white/10 px-4 py-2 text-left transition-colors hover:border-white/30 hover:bg-white/5"
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
