import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";
import db from "@/lib/db";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = body.username?.trim().toLowerCase();
  const password = body.password ?? "";
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  const row = db.prepare("SELECT password_hash FROM users WHERE username = ?").get(username) as
    | { password_hash: string }
    | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

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
