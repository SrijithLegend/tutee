import { NextRequest, NextResponse } from "next/server";
import { advanceClock } from "@/lib/clock";
import { getUserGraph } from "@/lib/path";
import { getUserId } from "@/lib/session";

export async function POST(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { days?: number };
  const days = body.days ?? 7;
  advanceClock(userId, days);
  return NextResponse.json(getUserGraph(userId));
}
