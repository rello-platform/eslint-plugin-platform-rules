"use strict";
const { RuleTester } = require("eslint");
const rule = require("../lib/rules/no-module-eval-cross-app-clients");

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-module-eval-cross-app-clients", rule, {
  valid: [
    // V1 -- Canonical lazy-init getter (PFP post-fix @ 706529c7)
    {
      code: 'let _billing = null; export function getBilling() { if (_billing) return _billing; _billing = createBillingClient({apiKey: process.env.RELLO_API_KEY}); return _billing; }',
      filename: "src/lib/billing/index.ts",
    },
    // V2 -- Newsletter-Studio Proxy pattern
    {
      code: 'export const billing = new Proxy({}, {get(_t, prop) { return getBilling()[prop]; }});',
      filename: "src/lib/billing/index.ts",
    },
    // V3 -- Drumbeat Proxy pattern
    {
      code: 'export const billing = new Proxy({}, { get(_t, p) { return getBilling()[p]; } });',
      filename: "src/lib/billing/index.ts",
    },
    // V4 -- OHH Proxy prisma
    {
      code: 'export const prisma = new Proxy({}, { get(_t, p) { return getPrisma()[p]; } });',
      filename: "src/lib/db.ts",
    },
    // V5 -- Rello ternary-gated Stripe
    {
      code: 'export const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;',
      filename: "src/lib/stripe/client.ts",
    },
    // V6 -- HS function-getter
    {
      code: 'let _rello = null; export function rello() { if (_rello) return _rello; _rello = createRelloClient({apiKey: process.env.RELLO_API_KEY}); return _rello; }',
      filename: "src/lib/rello-client.ts",
    },
    // V7 -- PrismaClient in lib/prisma.ts (PRISMA_FILE_RE whitelist)
    {
      code: 'export const prisma = new PrismaClient();',
      filename: "src/lib/prisma.ts",
    },
  ],
  invalid: [
    // I1 -- Canonical PFP pre-fix shape (createBillingClient + process.env)
    {
      code: 'export const billing = createBillingClient({apiKey: process.env.PATHFINDER_PRO_TO_RELLO_API_KEY, appSecret: process.env.RELLO_APP_SECRET, baseUrl: getRelloBaseUrl()});',
      filename: "src/lib/billing/index.ts",
      errors: [{ messageId: "moduleEvalCreateClient" }],
    },
    // I2 -- Canonical HH pre-fix shape
    {
      code: 'export const billing = createBillingClient({apiKey: process.env.RELLO_API_KEY, appSecret: process.env.RELLO_APP_SECRET});',
      filename: "src/lib/billing/index.ts",
      errors: [{ messageId: "moduleEvalCreateClient" }],
    },
    // I3 -- Canonical Milo pre-fix shape (direct Anthropic SDK, not AIClient wrapper)
    {
      code: 'export const anthropic = new Anthropic({apiKey: process.env.ANTHROPIC_API_KEY});',
      filename: "src/lib/ai-client.ts",
      errors: [{ messageId: "moduleEvalNewSdkClient" }],
    },
    // I4 -- P3 Property-Engine R2 (S3Client in SDK allowlist)
    {
      code: 'export const r2StorageService = new S3Client({region: process.env.R2_ACCOUNT_ID, credentials: {accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY}});',
      filename: "src/lib/storage/r2-service.ts",
      errors: [{ messageId: "moduleEvalNewSdkClient" }],
    },
    // I5 -- Bare top-level (non-export, still flagged)
    {
      code: 'const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);',
      filename: "src/lib/stripe/client.ts",
      errors: [{ messageId: "moduleEvalNewSdkClient" }],
    },
    // I6 -- Nested process.env in options (depth walk)
    {
      code: 'export const x = createMiloClient({transport: {headers: {auth: process.env.MILO_API_KEY}}});',
      filename: "src/lib/milo/client.ts",
      errors: [{ messageId: "moduleEvalCreateClient" }],
    },
    // I7 -- additionalSdkClasses extension via rule options
    {
      code: 'export const v = new CustomVendorClient({key: process.env.X});',
      filename: "src/lib/vendor.ts",
      options: [{ additionalSdkClasses: ["CustomVendorClient"] }],
      errors: [{ messageId: "moduleEvalNewSdkClient" }],
    },
    // I8 -- OpenAI direct
    {
      code: 'export const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});',
      filename: "src/lib/openai.ts",
      errors: [{ messageId: "moduleEvalNewSdkClient" }],
    },
    // I9 -- Twilio direct
    {
      code: 'export const twilio = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);',
      filename: "src/lib/twilio.ts",
      errors: [{ messageId: "moduleEvalNewSdkClient" }],
    },
  ],
});
