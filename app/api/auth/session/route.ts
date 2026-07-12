import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth";

export async function GET() {
  try { return NextResponse.json({ user: await currentUser() }); }
  catch { return NextResponse.json({ user: null }); }
}
