import db from "./db";

const getOffsetStmt = db.prepare(
  "SELECT offset_days FROM clock_offset WHERE user_id = ?"
);

const upsertOffsetStmt = db.prepare(`
  INSERT INTO clock_offset (user_id, offset_days) VALUES (?, ?)
  ON CONFLICT(user_id) DO UPDATE SET offset_days = excluded.offset_days
`);

/** Real time plus the user's simulated offset. Never call `new Date()` outside this file. */
export function now(userId: string): Date {
  const row = getOffsetStmt.get(userId) as { offset_days: number } | undefined;
  const offsetDays = row?.offset_days ?? 0;
  const real = Date.now();
  return new Date(real + offsetDays * 24 * 60 * 60 * 1000);
}

/** Advances the user's simulated clock by `days` (can be negative to rewind). */
export function advanceClock(userId: string, days: number): void {
  const row = getOffsetStmt.get(userId) as { offset_days: number } | undefined;
  upsertOffsetStmt.run(userId, (row?.offset_days ?? 0) + days);
}
