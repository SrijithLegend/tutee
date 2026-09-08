"use client";

import { useState } from "react";
import ExplainPanel from "@/components/ExplainPanel";
import type { GraphEdge, GraphNode } from "@/lib/path";
import type { PublicQuestion } from "@/lib/diagnosis";

type SequenceQuestionView = Extract<PublicQuestion, { gameType: "sequence" }> & { reason: string };

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface AnswerResponse {
  correct: boolean;
  graph: Graph;
}

interface DragSequenceProps {
  question: SequenceQuestionView;
  onComplete: (graph: Graph) => void;
}

// ponytail: reorder via up/down buttons rather than native HTML5 drag-and-drop — same
// grading outcome, but keyboard/automation-friendly and avoids drag-event fragility.
export default function DragSequence({ question, onComplete }: DragSequenceProps) {
  const [order, setOrder] = useState(question.items.map((_, i) => i)); // positions into question.items
  const [start] = useState(Date.now());
  const [result, setResult] = useState<AnswerResponse | null>(null);

  function move(pos: number, dir: -1 | 1) {
    const target = pos + dir;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[pos], next[target]] = [next[target], next[pos]];
    setOrder(next);
  }

  function submit() {
    const responseMs = Date.now() - start;
    const submittedOrder = order.map((pos) => question.itemOriginalIndices[pos]);
    fetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: question.id, order: submittedOrder, responseMs }),
    })
      .then((r) => r.json())
      .then(setResult);
  }

  function close() {
    if (result) onComplete(result.graph);
  }

  return (
    <>
      <p className="mb-1 text-xs uppercase tracking-wide text-white/40">Order the steps</p>
      <h2 className="mb-4 text-lg font-medium">{question.prompt}</h2>
      <ExplainPanel reason={question.reason} />
      {!result ? (
        <>
          <ol className="mb-4 flex flex-col gap-2">
            {order.map((itemIndex, pos) => (
              <li
                key={itemIndex}
                className="flex items-center justify-between rounded border border-white/10 px-3 py-2"
              >
                <span className="text-sm">
                  {pos + 1}. {question.items[itemIndex]}
                </span>
                <span className="flex gap-1">
                  <button
                    onClick={() => move(pos, -1)}
                    disabled={pos === 0}
                    aria-label="Move up"
                    className="rounded border border-white/10 px-2 py-0.5 text-xs hover:border-white/30 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(pos, 1)}
                    disabled={pos === order.length - 1}
                    aria-label="Move down"
                    className="rounded border border-white/10 px-2 py-0.5 text-xs hover:border-white/30 disabled:opacity-30"
                  >
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <button
            onClick={submit}
            className="w-full rounded border border-white/10 px-4 py-2 text-center transition-colors hover:border-white/30 hover:bg-white/5"
          >
            Submit order
          </button>
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
    </>
  );
}
