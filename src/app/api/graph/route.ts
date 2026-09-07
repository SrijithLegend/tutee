import { NextResponse } from "next/server";
import { getUserGraph } from "@/lib/path";
import { DEMO_USER_ID } from "@/lib/user";

export async function GET() {
  return NextResponse.json(getUserGraph(DEMO_USER_ID));
}
