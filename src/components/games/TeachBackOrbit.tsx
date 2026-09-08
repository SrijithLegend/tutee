"use client";

import { useEffect, useRef, useState } from "react";
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

interface TeachBackOrbitProps {
  conceptId: string;
  onComplete: (graph: Graph | null) => void;
  /** Drives the brightness (0..1) of the rogue "protégé" planet orbiting that star. */
  onBrightnessChange: (brightness: number) => void;
}

/** A rough, non-authoritative brightness proxy for live visual feedback only — actual scoring
 * (word-overlap against authored keyTerms) stays server-side so nothing gets leaked to the client. */
function estimateBrightness(explanation: string): number {
  const wordCount = explanation.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(0.7, wordCount / 40); // capped below 1: real credit only comes from a graded submit
}

/** Teach-Back, staged as a live orbiting body: Newton rides in as a dim planet next to the star
 * you're teaching, and visibly brightens as you write — then fully lights up on a strong answer. */
export default function TeachBackOrbit({ conceptId, onComplete, onBrightnessChange }: TeachBackOrbitProps) {
  const [prompt, setPrompt] = useState<TeachBackPrompt | null>(null);
  const [explanation, setExplanation] = useState("");
  const [result, setResult] = useState<TeachBackResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const onBrightnessChangeRef = useRef(onBrightnessChange);
  onBrightnessChangeRef.current = onBrightnessChange;

  useEffect(() => {
    onBrightnessChangeRef.current(0.08); // barely lit — Newton just showed up
    return () => onBrightnessChangeRef.current(0);
  }, [conceptId]);

  useEffect(() => {
    fetch(`/api/teach-back/${conceptId}`)
      .then((r) => r.json())
      .then(setPrompt);
  }, [conceptId]);

  function updateExplanation(value: string) {
    setExplanation(value);
    onBrightnessChangeRef.current(0.08 + estimateBrightness(value));
  }

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
        const coverage = r.totalTerms > 0 ? r.matchedTerms.length / r.totalTerms : 0;
        onBrightnessChangeRef.current(r.strong ? 1 : Math.max(0.2, coverage));
      });
  }

  return (
    // Camera holds the taught star roughly centered — anchor to a side column, not the center,
    // so the very planet this panel talks about stays visible instead of being covered by it.
    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-6">
      <div className="pointer-events-auto w-full max-w-sm rounded-sm border border-hairline bg-card/95 p-6 shadow-xl">
        {!prompt ? (
          <p className="text-muted">Loading&hellip;</p>
        ) : !result ? (
          <>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted">Teach it back</p>
            <h2 className="mb-6 font-serif text-2xl italic leading-snug">{prompt.prompt}</h2>
            <textarea
              value={explanation}
              onChange={(e) => updateExplanation(e.target.value)}
              rows={4}
              placeholder="Explaining it out loud is how it actually sticks&hellip; watch the planet catch the light."
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
