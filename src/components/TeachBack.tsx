"use client";

import { useEffect, useState } from "react";
import type { GraphEdge, GraphNode } from "@/lib/path";

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface TeachBackPrompt {
  conceptId: string;
  conceptName: string;
  prompt: string;
}

interface TeachBackResponse {
  matchedTerms: string[];
  totalTerms: number;
  strong: boolean;
  graph: Graph;
}

interface TeachBackProps {
  conceptId: string;
  /** null when the user skips or the attempt scored no matched terms (no graph change to apply). */
  onComplete: (graph: Graph | null) => void;
}

export default function TeachBack({ conceptId, onComplete }: TeachBackProps) {
  const [prompt, setPrompt] = useState<TeachBackPrompt | null>(null);
  const [explanation, setExplanation] = useState("");
  const [result, setResult] = useState<TeachBackResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/teach-back/${conceptId}`)
      .then((r) => r.json())
      .then(setPrompt);
  }, [conceptId]);

  function submit() {
    if (!explanation.trim()) return;
    setSubmitting(true);
    fetch(`/api/teach-back/${conceptId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ explanation }),
    })
      .then((r) => r.json())
      .then((r: TeachBackResponse) => {
        setSubmitting(false);
        setResult(r);
      });
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-6">
      <div className="w-full max-w-xl rounded-sm border border-hairline bg-card p-10 shadow-xl">
        {!prompt ? (
          <p className="text-muted">Loading…</p>
        ) : !result ? (
          <>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted">Teach it back</p>
            <h2 className="mb-6 font-serif text-2xl italic leading-snug">{prompt.prompt}</h2>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={5}
              placeholder="Explaining it out loud is how it actually sticks…"
              className="mb-4 w-full resize-none rounded-sm border border-hairline bg-black/[0.02] p-3 text-sm outline-none placeholder:text-muted focus:border-foreground/40"
            />
            <div className="flex items-center gap-4">
              <button
                onClick={submit}
                disabled={!explanation.trim() || submitting}
                className="flex-1 rounded-sm border border-hairline px-4 py-2 text-sm uppercase tracking-wide transition-colors hover:border-foreground/40 hover:bg-black/5 disabled:opacity-40"
              >
                {submitting ? "Reading…" : "Send to Newton"}
              </button>
              <button
                onClick={() => onComplete(null)}
                className="text-sm text-muted underline-offset-2 hover:underline"
              >
                Skip
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted">
              {result.strong ? "Newton gets it now" : result.matchedTerms.length > 0 ? "Getting there" : "Try again later"}
            </p>
            <h2 className="mb-4 font-serif text-2xl italic">{result.strong ? "That clicked." : "Good start."}</h2>
            <p className="mb-8 text-sm leading-relaxed text-foreground/70">
              {result.matchedTerms.length === 0
                ? "That didn't quite touch the core idea yet — no harm done, you can teach Newton again later."
                : `You covered ${result.matchedTerms.length} of ${result.totalTerms} key ideas: ${result.matchedTerms.join(", ")}.`}
            </p>
            <button
              onClick={() => onComplete(result.graph)}
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
