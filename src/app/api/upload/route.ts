import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";
import { analyzePdf } from "@/lib/pdfAnalysis";
import { getLearnedConceptOptions, saveUploadedConcept } from "@/lib/uploads";
import { getUserGraph } from "@/lib/path";
import { getUserId } from "@/lib/session";

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("pdf");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A PDF file is required" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "PDF is too large (max 15MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let text = "";
  try {
    text = (await pdfParse(buffer)).text.trim();
  } catch {
    return NextResponse.json({ error: "Couldn't read that PDF" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "No readable text found in that PDF" }, { status: 400 });
  }

  const candidates = getLearnedConceptOptions(userId);
  let analysis;
  try {
    analysis = await analyzePdf(text, candidates);
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF analysis failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  saveUploadedConcept(userId, analysis, file.name);
  return NextResponse.json(getUserGraph(userId));
}
