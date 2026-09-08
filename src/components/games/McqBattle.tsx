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
  misconceptionName: string | null;
  microExplanation: string | null;
  strikeCount: number | null;
  injected: boolean;
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
    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-sm border border-hairline bg-card p-8 shadow-xl">
        {!question ? (
          <p className="text-muted">Loading question…</p>
        ) : question.gameType === "sequence" ? (
          <DragSequence question={question} onComplete={onComplete} />
        ) : !result ? (
          <>
            <p className="mb-1 text-xs uppercase tracking-[0.2em] text-muted">MCQ Battle</p>
            <h2 className="mb-4 font-serif text-xl italic">{question.prompt}</h2>
            <ExplainPanel reason={question.reason} />
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
        ) : (
          <>
            <p className={`mb-2 text-lg font-medium ${result.correct ? "text-[#2E8B6F]" : "text-[#b8791f]"}`}>
              {result.correct ? "Correct!" : "Not quite."}
            </p>
            {!result.correct && result.misconceptionName && (
              <div className="mb-4 rounded-sm border border-[#E09A32]/40 bg-[#E09A32]/10 p-3">
                <p className="text-sm font-medium text-[#b8791f]">{result.misconceptionName}</p>
                {result.microExplanation && (
                  <p className="mt-1 text-sm text-foreground/70">{result.microExplanation}</p>
                )}
                {result.strikeCount != null && (
                  <p className="mt-2 text-xs text-muted">Strike {result.strikeCount} of 3</p>
                )}
              </div>
            )}
            {result.injected && (
              <p className="mb-4 text-sm text-[#2E8B6F]">
                A remedial node has been added to your graph to patch this gap.
              </p>
            )}
            <button
              onClick={close}
              className="w-full rounded-sm border border-hairline px-4 py-2 text-center text-sm uppercase tracking-wide transition-colors hover:border-foreground/40 hover:bg-black/5"
            >
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}
