"use strict";
const path = require("path");
const fs = require("fs");
const { RuleTester } = require("eslint");
const rule = require("../lib/rules/no-db-in-liveness");

// A-111 fixtures live on disk (the transitive walk reads modules from the
// filesystem). Reference them by absolute path so resolution is cwd-independent.
const FIX = path.join(__dirname, "fixtures");
const taintedRoute = path.join(FIX, "tainted/app/api/health/route.ts");
const cleanRoute = path.join(FIX, "clean/app/api/health/route.ts");
const cycleRoute = path.join(FIX, "cycle/app/api/health/route.ts");
const read = (f) => fs.readFileSync(f, "utf8");

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-db-in-liveness", rule, {
  valid: [
    // V1 -- liveness route, DB-free (the canonical fixed shape)
    {
      code: 'import { NextResponse } from "next/server"; export async function GET() { return NextResponse.json({ status: "healthy" }); }',
      filename: "src/app/api/health/route.ts",
    },
    // V2 -- bare /health liveness, no DB import
    {
      code: 'export async function GET() { return Response.json({ status: "ok" }); }',
      filename: "src/app/health/route.ts",
    },
    // V3 -- the deep readiness route LEGITIMATELY imports prisma (must NOT fire)
    {
      code: 'import { prisma } from "@/lib/db"; export async function GET() { await prisma.$queryRaw`SELECT 1`; return Response.json({}); }',
      filename: "src/app/api/health/ready/route.ts",
    },
    // V4 -- non-health route importing prisma (must NOT fire)
    {
      code: 'import { prisma } from "@/lib/db"; export async function GET() { return Response.json({}); }',
      filename: "src/app/api/users/route.ts",
    },
    // V5 -- liveness importing a non-DB module is fine
    {
      code: 'import { APP_SLUG } from "@/lib/constants"; export async function GET() { return Response.json({ app: APP_SLUG }); }',
      filename: "src/app/api/health/route.ts",
    },
    // V6 -- nested admin DIAGNOSTIC health route (auth-gated, on-demand) may hit the DB
    {
      code: 'import { prisma } from "@/lib/db"; export async function GET() { await prisma.app.findMany(); return Response.json({}); }',
      filename: "src/app/api/admin/lab/health/route.ts",
    },
    // V7 -- per-app admin health probe (dynamic segment) may hit the DB
    {
      code: 'import { prisma } from "@/lib/db"; export async function POST() { return Response.json({}); }',
      filename: "src/app/api/admin/apps/[slug]/health/route.ts",
    },
    // V8 (A-111) -- liveness whose transitive closure (route → helper → util) is
    // DB-free must NOT fire, even though the walk follows the real chain.
    {
      code: read(cleanRoute),
      filename: cleanRoute,
    },
    // V9 (A-111) -- a mutual import cycle in the closure must terminate (no hang)
    // and, being DB-free, must NOT fire.
    {
      code: read(cycleRoute),
      filename: cycleRoute,
    },
  ],
  invalid: [
    // I1 -- `@/lib/db` import in liveness
    {
      code: 'import { prisma } from "@/lib/db"; export async function GET() { return Response.json({}); }',
      filename: "src/app/api/health/route.ts",
      errors: [{ messageId: "dbInLiveness" }],
    },
    // I2 -- `@/lib/prisma` default import in liveness
    {
      code: 'import prisma from "@/lib/prisma"; export async function GET() { return Response.json({}); }',
      filename: "src/app/api/health/route.ts",
      errors: [{ messageId: "dbInLiveness" }],
    },
    // I3 -- `@prisma/client` import in liveness
    {
      code: 'import { PrismaClient } from "@prisma/client"; export async function GET() { return Response.json({}); }',
      filename: "src/app/api/health/route.ts",
      errors: [{ messageId: "dbInLiveness" }],
    },
    // I4 -- CommonJS require in liveness
    {
      code: 'const { prisma } = require("@/lib/db"); exports.GET = async () => Response.json({});',
      filename: "src/app/api/health/route.ts",
      errors: [{ messageId: "dbInLiveness" }],
    },
    // I5 -- bare /health liveness with prisma (covers the non-/api liveness surface)
    {
      code: 'import prisma from "@/lib/prisma"; export async function GET() { return Response.json({}); }',
      filename: "src/app/health/route.ts",
      errors: [{ messageId: "dbInLiveness" }],
    },
    // I6 -- relative ../lib/db import in liveness
    {
      code: 'import { prisma } from "../../../lib/db"; export async function GET() { return Response.json({}); }',
      filename: "src/app/api/health/route.ts",
      errors: [{ messageId: "dbInLiveness" }],
    },
    // I7 (A-111 plant) -- the route's OWN imports are all DB-free, but a helper
    // three hops down (route → @/lib/health/collect → @/lib/__plant__/deep →
    // @/lib/db) reaches the DB client. The pre-A-111 rule passed this green; the
    // transitive walk now reports it, naming the chain, on the helper import.
    {
      code: read(taintedRoute),
      filename: taintedRoute,
      // message-only assertion (RuleTester forbids message + messageId together):
      // proves both that it errors AND that the reported chain names every hop
      // from the route down to the DB client.
      errors: [{ message: /reaches a DB client.*@\/lib\/health\/collect → @\/lib\/__plant__\/deep → @\/lib\/db/ }],
    },
  ],
});
