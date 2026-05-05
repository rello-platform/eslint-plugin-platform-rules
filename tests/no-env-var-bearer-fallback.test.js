"use strict";

const { RuleTester } = require("eslint");
const rule = require("../lib/rules/no-env-var-bearer-fallback");

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const ROUTE_FILE = "src/app/api/admin/foo/route.ts";
const NON_ROUTE_FILE = "src/lib/something.ts";

ruleTester.run("no-env-var-bearer-fallback", rule, {
  valid: [
    // Outside route handler — rule does not apply.
    {
      code:
        'if (req.headers.get("authorization") === `Bearer ${process.env.X_SECRET}`) { allow(); }',
      filename: NON_ROUTE_FILE,
    },
    // Route handler using validateApiKey alone — clean.
    {
      code:
        'export async function POST(req) { await validateApiKey(req); return Response.json({ ok: true }); }',
      filename: ROUTE_FILE,
    },
    // Route handler with no validateApiKey AND no env-secret — clean.
    {
      code: 'export async function GET() { return Response.json({ ok: true }); }',
      filename: ROUTE_FILE,
    },
  ],
  invalid: [
    {
      code:
        'export async function POST(req) { if (req.headers.get("authorization") === `Bearer ${process.env.MILO_API_SECRET}`) { return Response.json({ ok: true }); } }',
      filename: ROUTE_FILE,
      errors: [{ messageId: "bearerCompareInRoute" }],
    },
    {
      code:
        'export async function POST(req) { const ok = await validateApiKey(req); if (!ok) { if (process.env.LEGACY_SECRET) { allow(); } } }',
      filename: ROUTE_FILE,
      errors: [{ messageId: "fallbackHeuristic" }],
    },
  ],
});
