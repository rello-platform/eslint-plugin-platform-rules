"use strict";

const { RuleTester } = require("eslint");
const rule = require("../lib/rules/no-fixture-data-when-upstream-unshipped");

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const ADMIN_API = "src/app/api/admin/overview/route.ts";
const NON_ADMIN_API = "src/app/api/v1/leads/route.ts";
const LIB = "src/lib/idempotency-key.ts";

ruleTester.run("no-fixture-data-when-upstream-unshipped", rule, {
  valid: [
    // Math.random outside admin api route — unaffected.
    { code: "const id = Math.random();", filename: LIB },
    // Math.random in a non-admin api route — unaffected.
    { code: "const id = Math.random();", filename: NON_ADMIN_API },
    // Plain hardcoded 0 with no fixture-shape comment — unaffected.
    {
      code: "export async function GET() { return Response.json({ count: 0 }); }",
      filename: ADMIN_API,
    },
  ],
  invalid: [
    {
      code: "export async function GET() { return Response.json({ x: Math.random() }); }",
      filename: ADMIN_API,
      errors: [{ messageId: "mathRandom" }],
    },
    {
      code:
        "export async function GET() { return Response.json({ mrr: 0 /* TODO: wire calculator */ }); }",
      filename: ADMIN_API,
      errors: [{ messageId: "improvisedZero" }],
    },
    {
      code:
        "// TODO: integrate PR-123 when shipped\nexport async function GET() { return Response.json({}); }",
      filename: ADMIN_API,
      errors: [{ messageId: "upstreamPrTodo" }],
    },
    {
      code:
        'export async function GET() { if (process.env.ENABLE_REAL_MRR) { return real(); } return Response.json({ mrr: 0 }); }',
      filename: ADMIN_API,
      errors: [{ messageId: "featureFlagPlaceholder" }],
    },
  ],
});
