// The only place in this app that calls an LLM. It's a one-time content-authoring step at upload
// time — turning a PDF into a lesson — and never touches the deterministic FSRS scheduling/mastery
// engine, which stays exactly as it was.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-5";
const MAX_PDF_CHARS = 15000; // ponytail: fixed truncation, raise or chunk+summarize if PDFs run long

export interface PdfAnalysis {
  name: string;
  explanation: string;
  workedExample: { problem: string; steps: string[] };
  keyTerms: string[];
  relatedConceptIds: string[];
}

function buildPrompt(text: string, candidates: { id: string; name: string }[]): string {
  const candidateList = candidates.length > 0 ? candidates.map((c) => `${c.id}: ${c.name}`).join("\n") : "(none yet)";

  return `You are authoring one micro-lesson from a student's uploaded PDF for a spaced-repetition study app.

PDF text (may be partial):
"""
${text}
"""

Concepts the student has already learned, as "id: name":
${candidateList}

Respond with ONLY a JSON object (no markdown fences, no commentary before or after) with exactly this shape:
{
  "name": "short topic name, under 40 characters",
  "explanation": "2-4 sentence plain-English explanation of the core idea in this PDF",
  "workedExample": { "problem": "a short example problem or scenario drawn from the material", "steps": ["step 1", "step 2", "step 3"] },
  "keyTerms": ["3 to 6 short phrases a correct explanation of this topic should include"],
  "relatedConceptIds": ["ids from the list above that this topic clearly builds on or connects to — empty array if none clearly apply"]
}`;
}

function stripJsonFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/, "")
    .trim();
}

function validateAnalysis(value: unknown, validIds: string[]): PdfAnalysis {
  if (typeof value !== "object" || value === null) throw new Error("Claude returned an unexpected shape");
  const v = value as Record<string, unknown>;

  if (typeof v.name !== "string" || !v.name.trim()) throw new Error("Missing a topic name");
  if (typeof v.explanation !== "string" || !v.explanation.trim()) throw new Error("Missing an explanation");

  const we = (v.workedExample ?? {}) as Record<string, unknown>;
  const problem = typeof we.problem === "string" ? we.problem : "";
  const steps = Array.isArray(we.steps) ? we.steps.filter((s): s is string => typeof s === "string") : [];

  const keyTerms = Array.isArray(v.keyTerms)
    ? v.keyTerms.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : [];
  if (keyTerms.length === 0) throw new Error("Missing key terms to teach back");

  // Only accept ids Claude was actually offered — never trust a model-invented graph id.
  const relatedConceptIds = Array.isArray(v.relatedConceptIds)
    ? v.relatedConceptIds.filter((id): id is string => typeof id === "string" && validIds.includes(id))
    : [];

  return {
    name: v.name.trim().slice(0, 80),
    explanation: v.explanation.trim(),
    workedExample: { problem, steps },
    keyTerms,
    relatedConceptIds,
  };
}

export async function analyzePdf(
  text: string,
  candidates: { id: string; name: string }[]
): Promise<PdfAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("PDF upload needs an Anthropic API key — add ANTHROPIC_API_KEY to .env.local and restart the server.");
  }

  const prompt = buildPrompt(text.slice(0, MAX_PDF_CHARS), candidates);

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Claude API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const raw = data.content?.[0]?.text;
  if (typeof raw !== "string") throw new Error("Unexpected response shape from Claude API");

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(raw));
  } catch {
    throw new Error("Claude did not return valid JSON");
  }

  return validateAnalysis(
    parsed,
    candidates.map((c) => c.id)
  );
}
