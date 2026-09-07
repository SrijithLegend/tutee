import { NextResponse } from "next/server";
import { getContent } from "@/lib/content";
import { recordAnswer, selectQuestion } from "@/lib/diagnosis";
import { getConceptStatus, getUserGraph } from "@/lib/path";
import { explainChallenge } from "@/lib/scheduler";
import { DEMO_USER_ID } from "@/lib/user";

export async function GET(request: Request) {
  const conceptId = new URL(request.url).searchParams.get("conceptId");
  if (!conceptId) {
    return NextResponse.json({ error: "conceptId query param is required" }, { status: 400 });
  }

  const concept = getContent().concepts.find((c) => c.id === conceptId);
  if (!concept) {
    return NextResponse.json({ error: "Unknown concept" }, { status: 404 });
  }

  const question = selectQuestion(DEMO_USER_ID, conceptId);
  const status = getConceptStatus(DEMO_USER_ID, conceptId);
  const reason = explainChallenge(conceptId, concept.name, status.mastery, status.retrievability).reason;
  return NextResponse.json({ ...question, reason });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { questionId?: string; optionId?: string; responseMs?: number };
  if (!body.questionId || !body.optionId) {
    return NextResponse.json({ error: "questionId and optionId are required" }, { status: 400 });
  }

  const question = getContent().questions.find((q) => q.id === body.questionId);
  if (!question || question.gameType !== "mcq") {
    return NextResponse.json({ error: "Unknown question" }, { status: 404 });
  }

  const result = recordAnswer(DEMO_USER_ID, question, body.optionId, body.responseMs);
  return NextResponse.json({ ...result, graph: getUserGraph(DEMO_USER_ID) });
}
