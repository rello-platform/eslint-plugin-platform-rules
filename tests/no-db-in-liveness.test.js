"use strict";
const { RuleTester } = require("eslint");
const rule = require("../lib/rules/no-db-in-liveness");

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
  ],
});
