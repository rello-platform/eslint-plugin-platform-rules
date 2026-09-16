import { NextResponse } from "next/server";
import { collectHealth } from "@/lib/health/collect";
export async function GET() { return NextResponse.json({ status: collectHealth() }); }
