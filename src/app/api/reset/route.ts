import { NextResponse } from "next/server";
import { resetUser } from "@/lib/db";
import { getUserGraph } from "@/lib/path";
import { DEMO_USER_ID } from "@/lib/user";

export async function POST() {
  resetUser(DEMO_USER_ID);
  return NextResponse.json(getUserGraph(DEMO_USER_ID));
}
