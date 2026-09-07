import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "tutee.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS fsrs_cards (
    user_id       TEXT NOT NULL,
    concept_id    TEXT NOT NULL,
    due           TEXT NOT NULL,
    stability     REAL NOT NULL,
    difficulty    REAL NOT NULL,
    elapsed_days  INTEGER NOT NULL,
    scheduled_days INTEGER NOT NULL,
    reps          INTEGER NOT NULL,
    lapses        INTEGER NOT NULL,
    state         INTEGER NOT NULL,
    last_review   TEXT,
    PRIMARY KEY (user_id, concept_id)
  );

  CREATE TABLE IF NOT EXISTS concept_progress (
    user_id     TEXT NOT NULL,
    concept_id  TEXT NOT NULL,
    learned     INTEGER NOT NULL DEFAULT 0,
    mastery     REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, concept_id)
  );

  CREATE TABLE IF NOT EXISTS attempts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT NOT NULL,
    question_id   TEXT NOT NULL,
    concept_id    TEXT NOT NULL,
    correct       INTEGER NOT NULL,
    misconception_id TEXT,
    response_ms   INTEGER,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS injected_nodes (
    user_id          TEXT NOT NULL,
    concept_id       TEXT NOT NULL,
    triggered_by     TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    PRIMARY KEY (user_id, concept_id)
  );

  CREATE TABLE IF NOT EXISTS clock_offset (
    user_id     TEXT PRIMARY KEY,
    offset_days INTEGER NOT NULL DEFAULT 0
  );
`);

const USER_TABLES = ["fsrs_cards", "concept_progress", "attempts", "injected_nodes", "clock_offset"];

/** Wipes a user's state back to zero across every user-state table. Content is never touched. */
export function resetUser(userId: string): void {
  for (const table of USER_TABLES) {
    db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
  }
}

export default db;
