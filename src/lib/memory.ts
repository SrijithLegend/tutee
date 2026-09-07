import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from "ts-fsrs";
import db from "./db";
import { now } from "./clock";

export { Rating };
export type { Grade };

const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));

interface FsrsCardRow {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
}

const getCardStmt = db.prepare(
  "SELECT due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review FROM fsrs_cards WHERE user_id = ? AND concept_id = ?"
);

const upsertCardStmt = db.prepare(`
  INSERT INTO fsrs_cards (user_id, concept_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id, concept_id) DO UPDATE SET
    due = excluded.due,
    stability = excluded.stability,
    difficulty = excluded.difficulty,
    elapsed_days = excluded.elapsed_days,
    scheduled_days = excluded.scheduled_days,
    reps = excluded.reps,
    lapses = excluded.lapses,
    state = excluded.state,
    last_review = excluded.last_review
`);

function rowToCard(row: FsrsCardRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

function saveCard(userId: string, conceptId: string, card: Card): void {
  upsertCardStmt.run(
    userId,
    conceptId,
    card.due.toISOString(),
    card.stability,
    card.difficulty,
    card.elapsed_days,
    card.scheduled_days,
    card.reps,
    card.lapses,
    card.state,
    card.last_review ? card.last_review.toISOString() : null
  );
}

/** Live retrievability (0-1) at now(userId). 0 if the concept has never been graded. */
export function getRetrievability(userId: string, conceptId: string): number {
  const row = getCardStmt.get(userId, conceptId) as FsrsCardRow | undefined;
  if (!row) return 0;
  const card = rowToCard(row);
  return scheduler.get_retrievability(card, now(userId), false);
}

/** Grade an answer for a concept, creating its FSRS card on first review. */
export function gradeAnswer(userId: string, conceptId: string, rating: Grade): void {
  const row = getCardStmt.get(userId, conceptId) as FsrsCardRow | undefined;
  const card = row ? rowToCard(row) : createEmptyCard(now(userId));
  const { card: nextCard } = scheduler.next(card, now(userId), rating);
  saveCard(userId, conceptId, nextCard);
}
