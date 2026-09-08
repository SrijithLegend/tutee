import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import db from "./db";

export const SESSION_COOKIE_NAME = "tutee_session";

export function createSession(userId: string): string {
  const id = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)").run(
    id,
    userId,
    new Date().toISOString()
  );
  return id;
}

export function destroySession(sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

/** Resolves the logged-in user's id from the session cookie on an incoming request, or null. */
export function getUserId(request: NextRequest): string | null {
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) return null;
  const row = db.prepare("SELECT user_id FROM sessions WHERE id = ?").get(sessionId) as
    | { user_id: string }
    | undefined;
  return row?.user_id ?? null;
}
