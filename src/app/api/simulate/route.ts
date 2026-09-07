import { NextResponse } from "next/server";
import { advanceClock } from "@/lib/clock";
import { getUserGraph } from "@/lib/path";
import { DEMO_USER_ID } from "@/lib/user";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { days?: number };
  const days = body.days ?? 7;
  advanceClock(DEMO_USER_ID, days);
  return NextResponse.json(getUserGraph(DEMO_USER_ID));
}
