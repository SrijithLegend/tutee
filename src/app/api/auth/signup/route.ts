import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import db from "@/lib/db";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = body.username?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!username || username.length < 3) {
    return NextResponse.json({ error: "Username must be at least 3 characters" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const existing = db.prepare("SELECT 1 FROM users WHERE username = ?").get(username);
  if (existing) {
    return NextResponse.json({ error: "That username is taken" }, { status: 409 });
  }

  db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)").run(
    username,
    hashPassword(password),
    new Date().toISOString()
  );

  const sessionId = createSession(username);
  const res = NextResponse.json({ username });
  res.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
