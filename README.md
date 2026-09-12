# tutee

*Mastery decays. So does the graph.*

tutee is a spaced-repetition learning platform for algebra where the concept map is a living 3D Milky Way — stars are concepts, planets are the specific ways you can misunderstand them, and the whole galaxy visibly cools when your memory does. Every decision the app makes about what to teach you next is deterministic: a real FSRS memory model, not a language model, decides what you see and why.

## What makes it different

**No LLM in the loop that decides what you learn.** Scheduling, mastery tracking, misconception diagnosis, and grading all run on [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) and hand-authored content. The one place an LLM appears is optional, one-shot, and outside that loop entirely: turning an uploaded PDF into a new lesson (see [PDF uploads](#pdf-uploads-experimental)).

**Every recommendation explains itself.** Click a star and the app tells you exactly why it's showing you this, in plain English with a live number: *"Retrievability on Distributive property dropped to 0.61."* Nothing is served on vibes.

**Getting something wrong is diagnostic, not just red ink.** Every wrong multiple-choice answer is tagged with a specific misconception. Hit the same one three times and the app injects a remedial concept into your graph, wedged between the thing you're failing and its prerequisite, until you clear it.

**The galaxy is the whole UI.** There's no separate dashboard. Your entire curriculum is one continuous, rotating 3D scene: unexplored topics sit grey and locked, newly-unlocked ones glow white, concepts you're actively working on burn red, and mastered ones settle into a cool blue.

## The galaxy, concretely

- **Stars = concepts.** Size tracks mastery, brightness tracks retrievability (FSRS's live "how well do you still remember this" estimate), color tracks state:
  | Color | Meaning |
  |---|---|
  | Grey | Locked — a prerequisite isn't mastered yet |
  | White | Unlocked, not yet studied |
  | Red | You've started it, not mastered |
  | Blue | Mastered |
- **Planets = misconceptions.** Each concept's specific wrong-answer patterns orbit it as planets that darken from neutral to amber to critical (with a ring) as you actually hit them.
- **Edges** connect prerequisites to what they unlock, and light up once that prerequisite is cleared.
- **A newly-unlocked star** flashes and briefly grows when its prerequisite crosses the mastery threshold, so an unlock is a moment, not a silent color change.
- **The dense spiral-arm starfield and glowing core** are pure atmosphere — thousands of particles laid along logarithmic spiral arms with Gaussian jitter, so it reads as an actual galaxy rather than a node graph with a starfield behind it.

## The protégé effect

Right after you learn something, you're asked to teach it back to Newton — explaining a concept out loud (or in writing) is one of the most reliable ways to actually retain it. Your explanation is scored by word-overlap against the concept's authored key terms (no LLM), and a strong explanation reinforces that concept's memory more than a shallow one would. In the spatial version of this flow, Newton rides in as a dim "rogue planet" next to the star you just learned, and visibly brightens as you type.

## Game modes

Every practice interaction ships in two forms, switchable with one environment flag:

| Interaction | Modal version (default-safe) | Spatial version (`NEXT_PUBLIC_SPATIAL=1`) |
|---|---|---|
| Practice a concept | MCQ Battle — centered card | **Constellation Draw** — drag a line from the star to the correct orbiting answer |
| Memory decayed on 2+ concepts | Recall Rush — timed centered card | **Decay Storm** — the camera holds on the decaying star while the rest of the galaxy visibly cools |
| Teach it back | Teach Back — centered card | **Teach-Back Orbit** — the rogue planet described above |

The modal versions never got deleted when the spatial ones were built — flip `NEXT_PUBLIC_SPATIAL` back to `0` (or delete it) and restart the dev server to fall back to them instantly, no other code changes required.

## PDF uploads (experimental)

You can upload a PDF and the app will turn it into a new star in your galaxy: Claude extracts a lesson (explanation, worked example, key terms) from the text, judges whether it connects to anything you've already learned, and — if so — draws an edge to it. The new concept is never locked (you chose to bring it in), and it plugs into the exact same lesson and teach-back flow as an authored concept. It currently supports learning + teaching back, not a practice quiz (authoring good misconception-tagged wrong answers needs real understanding of the material, which is future scope).

This is the one deliberate exception to the no-LLM rule, and it's scoped tightly: the LLM call happens once, at upload time, to author content — it never touches scheduling, grading, or what the app decides to show you next. It requires an `ANTHROPIC_API_KEY` in `.env.local`; without one, uploads fail with a message telling you to add it.

> **Status:** the upload pipeline (PDF text extraction → Claude → new graph node) is implemented but still being debugged — see [Known issues](#known-issues).

## Tech stack

- **Next.js 14** (App Router) + **TypeScript**, single process — no separate frontend/backend
- **[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)** for the memory model
- **three.js** for the 3D galaxy (custom spiral-arm particle fields, bloom post-processing, raycasted star/planet interaction)
- **`node:sqlite`** for all per-user state (chosen over `better-sqlite3` to avoid needing native build tools)
- **Tailwind CSS v4**, an epic.net-inspired design system (Fraunces + Inter, warm-grey/near-black palette)
- **`pdf-parse`** for text extraction and a raw `fetch` call to the Anthropic Messages API for the PDF-upload feature — no SDK dependency

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be asked to sign up or log in — every account gets its own galaxy, own mastery state, own decay clock.

### Environment variables (`.env.local`)

```bash
# Optional. "1" = spatial game modes (Constellation Draw, Decay Storm, Teach-Back Orbit).
# Unset or "0" = safe modal fallback. Requires a dev-server restart to take effect.
NEXT_PUBLIC_SPATIAL=1

# Optional. Only needed for PDF uploads.
ANTHROPIC_API_KEY=sk-ant-...
```

### Content vs. state

Curriculum content (concepts, misconceptions, questions, lessons) lives in `content/algebra.json` and is shared by everyone. Everything about a specific user — mastery, FSRS cards, attempt history, injected remedial nodes, uploaded PDFs — lives in per-user rows in SQLite (`data/tutee.db`), keyed by their username. Resetting a user (the header's Reset button) wipes their state; it never touches content.

## Project structure

```
content/algebra.json        Curriculum: concepts, misconceptions, questions, lessons
data/tutee.db                Per-user state (git-ignored, created on first run)

src/lib/
  memory.ts                  FSRS wrapper — the only place grading/retrievability math happens
  diagnosis.ts                Question selection, answer recording, answer-key stripping
  path.ts                     Assembles a user's graph: concepts + injected/uploaded nodes + edges
  scheduler.ts                Decides what to serve next, and why (explainability strings)
  teachback.ts                Word-overlap scoring for the protégé-effect exercise
  content.ts                  Loads/caches content/algebra.json
  clock.ts                    Per-user simulated clock (for the "Simulate 7 days" dev tool)
  db.ts                       SQLite schema + per-user reset
  auth.ts / session.ts        Password hashing (scrypt) and session cookies
  uploads.ts / pdfAnalysis.ts PDF-to-concept pipeline (the one LLM call in the app)

src/components/
  ConceptGraph.tsx             The 3D galaxy — stars, planets, edges, spiral dust, camera choreography
  LessonPanel.tsx, TeachBack.tsx, DevBar.tsx, UploadPdf.tsx, AuthForm.tsx
  games/                       McqBattle, RecallRush, DiagnosticQuiz, DragSequence,
                                and their spatial counterparts: ConstellationDraw, DecayStorm, TeachBackOrbit

src/app/
  page.tsx                     The single-page app shell — orchestrates every panel/game/focus state
  login/, signup/               Auth pages
  api/                          Route handlers: graph, diagnostic, lesson, answer, teach-back,
                                 simulate, reset, auth/*, upload

scripts/
  validate-content.ts          Structural checks on algebra.json (dangling ids, untagged distractors, cycles...)
  test-*.ts                    Regression scripts for the memory engine, diagnosis, injection,
                                lesson flow, MCQ, recall rush, sequence questions, teach-back
```

## Testing

There's no test framework — each `scripts/test-*.ts` is a small, dependency-free script that exercises one subsystem against a real (throwaway) user id and asserts on the result with Node's built-in `assert`:

```bash
npx tsx scripts/validate-content.ts
npx tsx scripts/test-memory.ts
npx tsx scripts/test-diagnosis.ts
npx tsx scripts/test-lesson.ts
npx tsx scripts/test-mcq.ts
npx tsx scripts/test-injection.ts
npx tsx scripts/test-simulate.ts
npx tsx scripts/test-recall-rush.ts
npx tsx scripts/test-sequence.ts
npx tsx scripts/test-teachback.ts
```

## Known issues

- **PDF upload hangs mid-request.** The route extracts text and calls Claude correctly in isolation, but something in the `pdf-parse` call path is currently causing the request to hang under Next's dev server rather than returning — under active investigation.
- **Dev-mode first-hit latency.** The very first request to any API route after a server (re)start triggers Next's on-demand compilation and can take several seconds. This disappears after that route's first hit, and doesn't happen in a production build.
- **Constellation Draw's star color** doesn't yet distinguish "practice" from "mastered" — it always renders as the practice color regardless of the concept's actual state.
