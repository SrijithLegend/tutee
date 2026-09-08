import fs from "node:fs";
import path from "node:path";
import type { ContentPack, McqQuestion } from "../src/types/content";

const contentPath = path.join(__dirname, "..", "content", "algebra.json");
const content: ContentPack = JSON.parse(fs.readFileSync(contentPath, "utf-8"));

const errors: string[] = [];

const conceptIds = new Set(content.concepts.map((c) => c.id));
const misconceptionIds = new Set(content.misconceptions.map((m) => m.id));

// Dangling concept IDs: prerequisites, misconception.conceptId, question.conceptId, remedialConceptId
for (const c of content.concepts) {
  for (const p of c.prerequisites) {
    if (!conceptIds.has(p)) errors.push(`concept "${c.id}" has dangling prerequisite "${p}"`);
  }
}
for (const m of content.misconceptions) {
  if (!conceptIds.has(m.conceptId)) errors.push(`misconception "${m.id}" has dangling conceptId "${m.conceptId}"`);
  if (m.remedialConceptId && !conceptIds.has(m.remedialConceptId)) {
    errors.push(`misconception "${m.id}" has dangling remedialConceptId "${m.remedialConceptId}"`);
  }
}
for (const q of content.questions) {
  if (!conceptIds.has(q.conceptId)) errors.push(`question "${q.id}" has dangling conceptId "${q.conceptId}"`);
}

// Every concept needs enough keyTerms to score a teach-back explanation
for (const c of content.concepts) {
  if (!c.lesson.keyTerms || c.lesson.keyTerms.length < 2) {
    errors.push(`concept "${c.id}" needs >= 2 lesson.keyTerms for teach-back scoring`);
  }
}

// Untagged distractors: every incorrect MCQ option must carry a non-null misconceptionId that exists
const mcqQuestions = content.questions.filter((q): q is McqQuestion => q.gameType === "mcq");
for (const q of mcqQuestions) {
  for (const opt of q.options) {
    if (!opt.correct && !opt.misconceptionId) {
      errors.push(`question "${q.id}" option "${opt.id}" is an untagged distractor`);
    }
    if (opt.misconceptionId && !misconceptionIds.has(opt.misconceptionId)) {
      errors.push(`question "${q.id}" option "${opt.id}" references unknown misconceptionId "${opt.misconceptionId}"`);
    }
  }
}

// Each misconception needs >= 3 questions that can surface it
const surfaceCount = new Map<string, number>();
for (const q of mcqQuestions) {
  const tagged = new Set(q.options.map((o) => o.misconceptionId).filter((id): id is string => !!id));
  for (const id of tagged) surfaceCount.set(id, (surfaceCount.get(id) ?? 0) + 1);
}
for (const m of content.misconceptions) {
  const n = surfaceCount.get(m.id) ?? 0;
  if (n < 3) errors.push(`misconception "${m.id}" is only surfaced by ${n} question(s), needs >= 3`);
}

// Prerequisite cycles
const WHITE = 0, GRAY = 1, BLACK = 2;
const color = new Map(content.concepts.map((c) => [c.id, WHITE]));
function visit(id: string, stack: string[]): void {
  color.set(id, GRAY);
  const concept = content.concepts.find((c) => c.id === id);
  for (const p of concept?.prerequisites ?? []) {
    if (!conceptIds.has(p)) continue; // already reported as dangling
    if (color.get(p) === GRAY) {
      errors.push(`prerequisite cycle: ${[...stack, id, p].join(" -> ")}`);
    } else if (color.get(p) === WHITE) {
      visit(p, [...stack, id]);
    }
  }
  color.set(id, BLACK);
}
for (const c of content.concepts) {
  if (color.get(c.id) === WHITE) visit(c.id, []);
}

if (errors.length > 0) {
  console.error(`Content validation FAILED with ${errors.length} error(s):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `Content OK: ${content.concepts.length} concepts, ${content.misconceptions.length} misconceptions, ${content.questions.length} questions.`
);
