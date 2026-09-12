import { NextRequest, NextResponse } from "next/server";
import { getContent } from "@/lib/content";
import { recordTeachBack } from "@/lib/teachback";
import { getUserGraph } from "@/lib/path";
import { getUserId } from "@/lib/session";
import { getUploadedConcept } from "@/lib/uploads";

export async function GET(request: NextRequest, { params }: { params: { conceptId: string } }) {
  const userId = getUserId(request);
  const concept =
    getContent().concepts.find((c) => c.id === params.conceptId) ??
    (userId ? getUploadedConcept(userId, params.conceptId) : undefined);
  if (!concept) {
    return NextResponse.json({ error: "Unknown concept" }, { status: 404 });
  }
  return NextResponse.json({
    conceptId: concept.id,
    conceptName: concept.name,
    prompt: `Newton is stuck on "${concept.name}." Explain it to him in your own words.`,
  });
}

export async function POST(request: NextRequest, { params }: { params: { conceptId: string } }) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const concept =
    getContent().concepts.find((c) => c.id === params.conceptId) ?? getUploadedConcept(userId, params.conceptId);
  if (!concept) {
    return NextResponse.json({ error: "Unknown concept" }, { status: 404 });
  }

  const body = (await request.json()) as { explanation?: string };
  if (!body.explanation || !body.explanation.trim()) {
    return NextResponse.json({ error: "explanation is required" }, { status: 400 });
  }

  const result = recordTeachBack(userId, concept.id, body.explanation);
  return NextResponse.json({ ...result, graph: getUserGraph(userId) });
}
