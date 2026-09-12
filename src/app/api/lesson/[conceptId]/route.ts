import { NextRequest, NextResponse } from "next/server";
import { getContent } from "@/lib/content";
import { markLearned } from "@/lib/path";
import { explainLesson } from "@/lib/scheduler";
import { getUserId } from "@/lib/session";
import { getUploadedConcept } from "@/lib/uploads";

export async function GET(request: NextRequest, { params }: { params: { conceptId: string } }) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const content = getContent();
  const concept = content.concepts.find((c) => c.id === params.conceptId) ?? getUploadedConcept(userId, params.conceptId);
  if (!concept) {
    return NextResponse.json({ error: "Unknown concept" }, { status: 404 });
  }

  markLearned(userId, concept.id);

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
