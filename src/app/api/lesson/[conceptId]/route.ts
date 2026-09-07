import { NextResponse } from "next/server";
import { getContent } from "@/lib/content";
import { markLearned } from "@/lib/path";
import { explainLesson } from "@/lib/scheduler";
import { DEMO_USER_ID } from "@/lib/user";

export async function GET(_request: Request, { params }: { params: { conceptId: string } }) {
  const content = getContent();
  const concept = content.concepts.find((c) => c.id === params.conceptId);
  if (!concept) {
    return NextResponse.json({ error: "Unknown concept" }, { status: 404 });
  }

  markLearned(DEMO_USER_ID, concept.id);

  const misconceptions = content.misconceptions
    .filter((m) => m.conceptId === concept.id)
    .map((m) => ({ id: m.id, name: m.name }));

  return NextResponse.json({
    id: concept.id,
    name: concept.name,
    explanation: concept.lesson.explanation,
    workedExample: concept.lesson.workedExample,
    misconceptionWarning: concept.lesson.misconceptionWarning,
    misconceptions,
    reason: explainLesson(concept.id, concept.name).reason,
  });
}
