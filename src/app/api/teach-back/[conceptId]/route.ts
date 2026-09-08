import { NextResponse } from "next/server";
import { getContent } from "@/lib/content";
import { recordTeachBack } from "@/lib/teachback";
import { getUserGraph } from "@/lib/path";
import { DEMO_USER_ID } from "@/lib/user";

export async function GET(_request: Request, { params }: { params: { conceptId: string } }) {
  const concept = getContent().concepts.find((c) => c.id === params.conceptId);
  if (!concept) {
    return NextResponse.json({ error: "Unknown concept" }, { status: 404 });
  }
  return NextResponse.json({
    conceptId: concept.id,
    conceptName: concept.name,
    prompt: `Newton is stuck on "${concept.name}." Explain it to him in your own words.`,
  });
}

export async function POST(request: Request, { params }: { params: { conceptId: string } }) {
  const concept = getContent().concepts.find((c) => c.id === params.conceptId);
  if (!concept) {
    return NextResponse.json({ error: "Unknown concept" }, { status: 404 });
  }

  const body = (await request.json()) as { explanation?: string };
  if (!body.explanation || !body.explanation.trim()) {
    return NextResponse.json({ error: "explanation is required" }, { status: 400 });
  }

  const result = recordTeachBack(DEMO_USER_ID, concept.id, body.explanation);
  return NextResponse.json({ ...result, graph: getUserGraph(DEMO_USER_ID) });
}
