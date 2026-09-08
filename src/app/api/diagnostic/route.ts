import { NextRequest, NextResponse } from "next/server";
import { getDiagnosticQuestions, runDiagnostic, type DiagnosticAnswer } from "@/lib/diagnosis";
import { getUserGraph } from "@/lib/path";
import { getUserId } from "@/lib/session";

export async function GET() {
  return NextResponse.json({ questions: getDiagnosticQuestions() });
}

export async function POST(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { answers?: DiagnosticAnswer[] };
  if (!Array.isArray(body.answers)) {
    return NextResponse.json({ error: "answers must be an array" }, { status: 400 });
  }
  runDiagnostic(userId, body.answers);
  return NextResponse.json(getUserGraph(userId));
}
