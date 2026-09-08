import { NextRequest, NextResponse } from "next/server";
import { getContent } from "@/lib/content";
import { recordAnswer, recordSequenceAnswer, selectQuestion } from "@/lib/diagnosis";
import { getConceptStatus, getUserGraph } from "@/lib/path";
import { explainChallenge } from "@/lib/scheduler";
import { getUserId } from "@/lib/session";

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conceptId = new URL(request.url).searchParams.get("conceptId");
  if (!conceptId) {
    return NextResponse.json({ error: "conceptId query param is required" }, { status: 400 });
  }

  const concept = getContent().concepts.find((c) => c.id === conceptId);
  if (!concept) {
    return NextResponse.json({ error: "Unknown concept" }, { status: 404 });
  }

  const question = selectQuestion(userId, conceptId);
  const status = getConceptStatus(userId, conceptId);
  const reason = explainChallenge(conceptId, concept.name, status.mastery, status.retrievability).reason;
  return NextResponse.json({ ...question, reason });
}

export async function POST(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    questionId?: string;
    optionId?: string;
    order?: number[];
    responseMs?: number;
  };
  if (!body.questionId) {
    return NextResponse.json({ error: "questionId is required" }, { status: 400 });
  }

  const question = getContent().questions.find((q) => q.id === body.questionId);
  if (!question) {
    return NextResponse.json({ error: "Unknown question" }, { status: 404 });
  }

  if (question.gameType === "mcq") {
    if (!body.optionId) {
      return NextResponse.json({ error: "optionId is required for an mcq question" }, { status: 400 });
    }
    const result = recordAnswer(userId, question, body.optionId, body.responseMs);
    const misconception = result.misconceptionId
      ? getContent().misconceptions.find((m) => m.id === result.misconceptionId)
      : undefined;
    return NextResponse.json({
      ...result,
      misconceptionName: misconception?.name ?? null,
      microExplanation: misconception?.microExplanation ?? null,
      graph: getUserGraph(userId),
    });
  }

  if (!Array.isArray(body.order)) {
    return NextResponse.json({ error: "order is required for a sequence question" }, { status: 400 });
  }
  const result = recordSequenceAnswer(userId, question, body.order, body.responseMs);
  return NextResponse.json({
    ...result,
    misconceptionId: null,
    strikeCount: null,
    injected: false,
    graph: getUserGraph(userId),
  });
}
