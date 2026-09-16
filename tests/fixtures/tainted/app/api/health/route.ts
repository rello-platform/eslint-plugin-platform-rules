// A-111 plant: liveness route whose OWN imports are all DB-free, but a helper
// three hops down reaches @/lib/db. The pre-A-111 rule saw only this file's
// specifiers and passed it green.
import { NextResponse } from "next/server";
import { collectHealth } from "@/lib/health/collect";
export async function GET() {
  return NextResponse.json({ status: collectHealth() });
}
