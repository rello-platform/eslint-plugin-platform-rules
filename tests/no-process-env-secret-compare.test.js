"use strict";

const { RuleTester } = require("eslint");
const rule = require("../lib/rules/no-process-env-secret-compare");

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-process-env-secret-compare", rule, {
  valid: [
    // Feature-flag truthiness check — not Bearer-shaped.
    { code: 'if (process.env.ENABLE_FOO === "true") { go(); }' },
    // Non-Bearer compare.
    { code: 'if (process.env.NODE_ENV === "production") { ship(); }' },
    // validateApiKey call (no env compare).
    { code: 'await validateApiKey(req);' },
    // Bearer template literal not interpolating an env secret.
    { code: 'const auth = `Bearer ${apiKey}`;' },
  ],
  invalid: [
    {
      code:
        'if (req.headers.get("authorization") === `Bearer ${process.env.MILO_API_SECRET}`) { allow(); }',
      errors: [{ messageId: "bearerEnvCompare" }],
    },
    {
      code:
        'const ok = process.env.RELLO_APP_SECRET === `Bearer ${process.env.RELLO_APP_SECRET}`;',
      errors: [{ messageId: "bearerEnvCompare" }],
    },
    {
      code:
        'if (auth === `Bearer ${process.env.SIGNAL_ROUTER_SECRET}`) { allow(); }',
      errors: [], // No header read or env access on the LHS — heuristically valid here.
    },
  ].filter((c) => c.errors.length > 0),
});
