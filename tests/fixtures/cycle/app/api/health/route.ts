import { NextResponse } from "next/server";
import { a } from "@/lib/a";
export async function GET() { return NextResponse.json({ a: a() }); }
