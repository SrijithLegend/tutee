"use client";

import { useEffect, useState } from "react";
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
  misconceptionId: string | null;
  graph: Graph;
}

interface McqBattleProps {
  conceptId: string;
  onComplete: (graph: Graph) => void;
}

export default function McqBattle({ conceptId, onComplete }: McqBattleProps) {
  const [question, setQuestion] = useState<QuestionView | null>(null);
  const [questionStart, setQuestionStart] = useState(0);
  const [result, setResult] = useState<AnswerResponse | null>(null);

  useEffect(() => {
    fetch(`/api/answer?conceptId=${encodeURIComponent(conceptId)}`)
      .then((r) => r.json())
      .then((q: QuestionView) => {
        setQuestion(q);
        setQuestionStart(Date.now());
      });
  }, [conceptId]);

  function selectOption(optionId: string) {
    if (!question) return;
    const responseMs = Date.now() - questionStart;
    fetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: question.id, optionId, responseMs }),
    })
      .then((r) => r.json())
      .then(setResult);
  }

  function close() {
    if (result) onComplete(result.graph);
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-lg rounded-lg border border-white/10 bg-[#11151f] p-6">
        {!question ? (
          <p className="text-white/60">Loading question…</p>
        ) : question.gameType === "sequence" ? (
          <DragSequence question={question} onComplete={onComplete} />
        ) : !result ? (
          <>
            <p className="mb-1 text-xs uppercase tracking-wide text-white/40">MCQ Battle</p>
            <h2 className="mb-4 text-lg font-medium">{question.prompt}</h2>
            <ExplainPanel reason={question.reason} />
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
        ) : (
          <>
            <p className={`mb-4 text-lg font-medium ${result.correct ? "text-[#2E8B6F]" : "text-[#E09A32]"}`}>
              {result.correct ? "Correct!" : "Not quite."}
            </p>
            <button
              onClick={close}
              className="w-full rounded border border-white/10 px-4 py-2 text-center transition-colors hover:border-white/30 hover:bg-white/5"
            >
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}
