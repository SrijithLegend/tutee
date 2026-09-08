"use client";

import { useEffect, useState } from "react";
import ExplainPanel from "@/components/ExplainPanel";

interface Lesson {
  id: string;
  name: string;
  explanation: string;
  workedExample: { problem: string; steps: string[] };
  misconceptionWarning: string;
  misconceptions: { id: string; name: string }[];
  reason: string;
}

interface LessonPanelProps {
  conceptId: string;
  onClose: () => void;
}

export default function LessonPanel({ conceptId, onClose }: LessonPanelProps) {
  const [lesson, setLesson] = useState<Lesson | null>(null);

  useEffect(() => {
    setLesson(null);
    fetch(`/api/lesson/${conceptId}`)
      .then((r) => r.json())
      .then(setLesson);
  }, [conceptId]);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-xl rounded-sm border border-hairline bg-card p-8 shadow-xl">
        {!lesson ? (
          <p className="text-muted">Loading lesson…</p>
        ) : (
          <>
            <p className="mb-1 text-xs uppercase tracking-[0.2em] text-muted">Lesson</p>
            <h2 className="mb-4 font-serif text-2xl italic">{lesson.name}</h2>

            <ExplainPanel reason={lesson.reason} />

            <p className="mb-4 text-sm leading-relaxed text-foreground/80">{lesson.explanation}</p>

            <div className="mb-4 rounded-sm border border-hairline bg-black/[0.03] p-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-muted">Worked example</p>
              <p className="mb-2 font-mono text-sm text-foreground">{lesson.workedExample.problem}</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground/70">
                {lesson.workedExample.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>

            {lesson.misconceptions.length > 0 && (
              <div className="mb-6 rounded-sm border border-[#E09A32]/40 bg-[#E09A32]/10 p-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-[#b8791f]">Watch out for</p>
                <p className="mb-2 text-sm text-foreground/70">{lesson.misconceptionWarning}</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/80">
                  {lesson.misconceptions.map((m) => (
                    <li key={m.id}>{m.name}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full rounded-sm border border-hairline px-4 py-2 text-center text-sm uppercase tracking-wide transition-colors hover:border-foreground/40 hover:bg-black/5"
            >
              Got it
            </button>
          </>
        )}
      </div>
    </div>
  );
}
