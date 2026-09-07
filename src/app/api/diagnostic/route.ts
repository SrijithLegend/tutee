import { NextResponse } from "next/server";
import { getDiagnosticQuestions, runDiagnostic, type DiagnosticAnswer } from "@/lib/diagnosis";
import { getUserGraph } from "@/lib/path";
import { DEMO_USER_ID } from "@/lib/user";

export async function GET() {
  return NextResponse.json({ questions: getDiagnosticQuestions() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { answers?: DiagnosticAnswer[] };
  if (!Array.isArray(body.answers)) {
    return NextResponse.json({ error: "answers must be an array" }, { status: 400 });
  }
  runDiagnostic(DEMO_USER_ID, body.answers);
  return NextResponse.json(getUserGraph(DEMO_USER_ID));
}
