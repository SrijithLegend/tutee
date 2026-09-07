"use client";

import { useEffect, useState } from "react";

interface Lesson {
  id: string;
  name: string;
  explanation: string;
  workedExample: { problem: string; steps: string[] };
  misconceptionWarning: string;
  misconceptions: { id: string; name: string }[];
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
    <div className="absolute inset-0 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-xl rounded-lg border border-white/10 bg-[#11151f] p-6">
        {!lesson ? (
          <p className="text-white/60">Loading lesson…</p>
        ) : (
          <>
            <p className="mb-1 text-xs uppercase tracking-wide text-white/40">Lesson</p>
            <h2 className="mb-4 text-lg font-medium">{lesson.name}</h2>

            <p className="mb-4 text-sm leading-relaxed text-white/80">{lesson.explanation}</p>

            <div className="mb-4 rounded border border-white/10 bg-black/30 p-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-white/40">Worked example</p>
              <p className="mb-2 font-mono text-sm text-white/90">{lesson.workedExample.problem}</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-white/70">
                {lesson.workedExample.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>

            {lesson.misconceptions.length > 0 && (
              <div className="mb-6 rounded border border-[#E09A32]/30 bg-[#E09A32]/10 p-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-[#E09A32]">Watch out for</p>
                <p className="mb-2 text-sm text-white/70">{lesson.misconceptionWarning}</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-white/80">
                  {lesson.misconceptions.map((m) => (
                    <li key={m.id}>{m.name}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full rounded border border-white/10 px-4 py-2 text-center transition-colors hover:border-white/30 hover:bg-white/5"
            >
              Got it
            </button>
          </>
        )}
      </div>
    </div>
  );
}
