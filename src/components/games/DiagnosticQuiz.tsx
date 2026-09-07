"use client";

import { useEffect, useState } from "react";
import type { GraphEdge, GraphNode } from "@/lib/path";

interface DiagnosticQuestion {
  id: string;
  conceptId: string;
  prompt: string;
  options: { id: string; text: string }[];
}

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface DiagnosticQuizProps {
  onComplete: (graph: Graph) => void;
}

export default function DiagnosticQuiz({ onComplete }: DiagnosticQuizProps) {
  const [questions, setQuestions] = useState<DiagnosticQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<{ questionId: string; optionId: string; responseMs: number }[]>([]);
  const [questionStart, setQuestionStart] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/diagnostic")
      .then((r) => r.json())
      .then((data: { questions: DiagnosticQuestion[] }) => {
        setQuestions(data.questions);
        setQuestionStart(Date.now());
      });
  }, []);

  function selectOption(optionId: string) {
    if (!questions) return;
    const question = questions[index];
    const responseMs = Date.now() - questionStart;
    const nextAnswers = [...answers, { questionId: question.id, optionId, responseMs }];

    if (index + 1 < questions.length) {
      setAnswers(nextAnswers);
      setIndex(index + 1);
      setQuestionStart(Date.now());
      return;
    }

    setSubmitting(true);
    fetch("/api/diagnostic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: nextAnswers }),
    })
      .then((r) => r.json())
      .then(onComplete);
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-lg rounded-lg border border-white/10 bg-[#11151f] p-6">
        {!questions ? (
          <p className="text-white/60">Loading diagnostic…</p>
        ) : submitting ? (
          <p className="text-white/60">Scoring your baseline…</p>
        ) : (
          <>
            <p className="mb-4 text-xs uppercase tracking-wide text-white/40">
              Diagnostic — question {index + 1} of {questions.length}
            </p>
            <h2 className="mb-6 text-lg font-medium">{questions[index].prompt}</h2>
            <div className="flex flex-col gap-2">
              {questions[index].options.map((option) => (
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
