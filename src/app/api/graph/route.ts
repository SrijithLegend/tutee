import { NextRequest, NextResponse } from "next/server";
import { getUserGraph } from "@/lib/path";
import { getUserId } from "@/lib/session";

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(getUserGraph(userId));
}
