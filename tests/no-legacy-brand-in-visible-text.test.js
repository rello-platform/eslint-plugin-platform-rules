"use strict";

// RALLYROO Phase 2 (PLATFORM-RENAME-RALLYROO spec §4): the product is renamed
// Rello → Rallyroo. Visible strings read PLATFORM_BRAND.name from
// @rello-platform/slugs; this rule refuses the name typed by hand.
//
// RuleTester is wired to node:test's describe/it so every case is its own
// reported test (without this, the first failing case aborts the whole file and
// a red run shows one failure instead of which shapes are uncovered).

const { describe, it } = require("node:test");
const { RuleTester } = require("eslint");
const tsParser = require("@typescript-eslint/parser");
const rule = require("../lib/rules/no-legacy-brand-in-visible-text");

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const SRC = "src/components/Header.tsx";
const LIB = "src/lib/email/index.ts";
const legacy = (found) => ({ messageId: "legacyBrand", data: { found } });
const typed = (found) => ({ messageId: "handTypedBrand", data: { found } });

ruleTester.run("no-legacy-brand-in-visible-text", rule, {
  valid: [
    // ── the fix the rule asks for ─────────────────────────────────────────
    {
      code: 'import { PLATFORM_BRAND } from "@rello-platform/slugs";\nconst n = tenant?.tenantName || PLATFORM_BRAND.name;',
      filename: LIB,
    },
    { code: "const el = <h1>Welcome to {PLATFORM_BRAND.name}</h1>;", filename: SRC },
    { code: "const t = `Welcome to ${PLATFORM_BRAND.name}`;", filename: LIB },

    // ── log / throw arguments ─────────────────────────────────────────────
    { code: 'console.error("[Rello] send failed", id);', filename: LIB },
    { code: "console.warn(`Rello webhook ${id} retried`);", filename: LIB },
    { code: 'console.log("Rello");', filename: LIB },
    { code: 'logger.info("Rello sync done");', filename: LIB },
    { code: 'this.logger.error({ msg: "Rello sync failed" });', filename: LIB },
    { code: 'log.warn("Rello");', filename: LIB },
    // An Error inside a log call is still a log argument.
    { code: 'console.error(new Error("Rello down"));', filename: LIB },
    { code: 'logger.warn("retry", new TypeError("Rello timeout"));', filename: LIB },
    // The class name is an identifier; only its message string is text.
    { code: "class RelloApiError extends Error {}", filename: LIB },

    // ── import paths and module specifiers ────────────────────────────────
    { code: 'import { x } from "@/lib/Rello/client";', filename: LIB },
    { code: 'import "./Rello.css";', filename: LIB },
    { code: 'export { y } from "../Rello/y";', filename: LIB },
    { code: 'export * from "../Rello";', filename: LIB },
    { code: 'const m = await import("./Rello");', filename: LIB },
    { code: 'const m = require("./Rello");', filename: LIB },
    { code: 'vi.mock("@/lib/Rello", () => ({}));', filename: LIB },

    // ── object keys, identifiers, comments ────────────────────────────────
    { code: 'const map = { "Rello": 1, Rello: 2 };', filename: LIB },
    { code: 'class A { "Rello" = 1; "Rello Platform"() {} }', filename: LIB },
    { code: 'interface I { "Rello": string }', filename: LIB },
    { code: "const Rello = 1; function RelloLogo() { return null; }", filename: LIB },
    { code: "const el = <RelloLogo />;", filename: SRC },
    { code: "// Rello is the hub\n/* Rello */ const x = 1;", filename: LIB },
    { code: "const el = <div>{/* Rello */}</div>;", filename: SRC },

    // ── the slug, routing identifiers, type positions ─────────────────────
    { code: 'const s = "rello";', filename: LIB },
    { code: 'const apps = APP_SLUGS.filter((s) => s !== "rello");', filename: LIB },
    { code: 'const k = { appSource: "RELLO" };', filename: LIB },
    { code: 'type Source = "Rello" | "rello";', filename: LIB },
    { code: 'if (name === "Rello") rename();', filename: LIB },
    { code: 'switch (x) { case "Rello": break; }', filename: LIB },
    { code: 'const isOld = label.includes("Rello");', filename: LIB },
    { code: 'const fixed = text.replace("Rello", PLATFORM_BRAND.name);', filename: LIB },

    // ── hostnames, emails, paths, headers, env var names ──────────────────
    { code: 'const u = "https://hellorello.app/pricing";', filename: LIB },
    { code: 'const h = "app.hellorello.app";', filename: LIB },
    { code: 'const h = "acme.mg.hellorello.app";', filename: LIB },
    { code: 'const u = "https://Rello.app/x";', filename: LIB },
    { code: 'const a = "noreply@Rello.app";', filename: LIB },
    { code: 'const p = "/welcome/Rello";', filename: LIB },
    { code: 'const hdr = { "X-Rello-Tenant-Id": id };', filename: LIB },
    { code: 'headers.set("X-Rello-Signature", sig);', filename: LIB },
    { code: 'const name = "X-Rello-Tenant-Id";', filename: LIB },
    { code: 'const v = process.env["RELLO_API_URL"];', filename: LIB },
    { code: 'const n = "RELLO_APP_SECRET";', filename: LIB },
    { code: "const el = <a href=\"https://hellorello.app\">x</a>;", filename: SRC },

    // ── non-visible JSX attributes ────────────────────────────────────────
    { code: 'const el = <div className="Rello-card" />;', filename: SRC },
    { code: 'const el = <div data-testid="Rello header" id="Rello" />;', filename: SRC },
    { code: 'const el = <img src="/logos/Rello.png" alt={PLATFORM_BRAND.name} />;', filename: SRC },

    // ── tagged templates (SQL / styles) ───────────────────────────────────
    { code: 'const r = await prisma.$queryRaw`SELECT 1 FROM "Rello Tenant"`;', filename: LIB },
    { code: "const q = sql`SELECT 'Rello'`;", filename: LIB },

    // ── the new name in domains and slugs (lowercase) ─────────────────────
    { code: 'const d = "hellorallyroo.com";', filename: LIB },
    { code: 'const s = "rallyroo";', filename: LIB },
    { code: 'const e = "support@hellorallyroo.com";', filename: LIB },
    { code: 'const u = "https://gorallyroo.com/x";', filename: LIB },

    // ── non-brand words that merely contain the letters ───────────────────
    { code: 'const w = "Morello cherries, Prello, Relloc";', filename: LIB },

    // ── (a) compounds: internal names stay silent where they already were ──
    { code: "const RelloCRM = 1; function RelloHub() { return null; }", filename: LIB },
    { code: 'import { c } from "@/lib/RelloCRM/client";', filename: LIB },
    { code: 'const v = process.env.RELLO2_URL; const k = "RELLO_V2_KEY";', filename: LIB },
    { code: 'const s = "rello2"; const t = "relloCrm";', filename: LIB },
    { code: 'const s = "RELLOAPI";', filename: LIB },
    { code: 'const map = { RelloCRM: 1, "RelloHub": 2 };', filename: LIB },
    { code: 'const u = "https://RelloCRM.app/x";', filename: LIB },

    // ── (b) entities decode only where they render: JSX, and HTML-looking strings ──
    { code: 'const s = "R&#101;llo";', filename: LIB },
    { code: "const el = <p>Morello &amp; Prello</p>;", filename: SRC },
    { code: 'const el = <p title="Morello &amp; Prello">x</p>;', filename: SRC },

    // ── (c) the bare RELLO routing literal outside rendered JSX ───────────
    { code: 'const id = toSourceAppIdentifier("RELLO");', filename: LIB },
    { code: 'const src = "RELLO";', filename: LIB },

    // ── (d) components: key / ref / className / data-* stay exempt ────────
    {
      code: 'const el = <Badge key="Rello" ref={r} className="Rello-card" data-testid="Rello badge" />;',
      filename: SRC,
    },
    { code: 'const el = <Ui.Card key="Rello" data-x="Rello" />;', filename: SRC },

    // ── tests, fixtures and allowlisted files ─────────────────────────────
    { code: 'const s = "Rello CRM";', filename: "src/lib/email/index.test.ts" },
    { code: 'const s = "Rello CRM";', filename: "src/__tests__/x.ts" },
    { code: 'const s = "Rello CRM";', filename: "src/lib/growth/senders.pg-test.ts" },
    { code: 'const s = "Rello CRM";', filename: "src/lib/x.node-test.ts" },
    { code: 'const s = "Rello CRM";', filename: "src/lib/x.test-helper.ts" },
    { code: 'const s = "Rello CRM";', filename: "src/lib/x.testkit.ts" },
    { code: 'const s = "Rello CRM";', filename: "src/components/x.stories.tsx" },
    { code: 'const s = "Rello CRM";', filename: "src/lib/x.fixtures.ts" },
    { code: 'const s = "Rello CRM";', filename: "src/lib/__fixtures__/x.ts" },
    {
      code: 'const s = "Rello CRM";',
      filename: "src/app/legal/privacy/page.tsx",
      options: [{ allow: ["src/app/legal/**"] }],
    },
    {
      code: 'const s = "Rello CRM";',
      filename: "/abs/repo/src/lib/redirects.ts",
      options: [{ allow: ["**/redirects.ts"] }],
    },
  ],

  invalid: [
    // ── JSX text ──────────────────────────────────────────────────────────
    { code: "const el = <h1>Welcome to Rello</h1>;", filename: SRC, errors: [legacy("Rello")] },
    { code: "const el = <p>RELLO HQ</p>;", filename: SRC, errors: [legacy("RELLO")] },
    { code: "const el = <p>Rello's dashboard</p>;", filename: SRC, errors: [legacy("Rello")] },
    {
      code: "const el = <p>Rello and Rello again</p>;",
      filename: SRC,
      errors: [legacy("Rello"), legacy("Rello")],
    },
    { code: "const el = <p>Welcome to Rallyroo</p>;", filename: SRC, errors: [typed("Rallyroo")] },
    { code: "const el = <p>RallyRoo</p>;", filename: SRC, errors: [typed("RallyRoo")] },
    { code: "const el = <p>RALLYROO</p>;", filename: SRC, errors: [typed("RALLYROO")] },

    // ── visible JSX string attributes ─────────────────────────────────────
    { code: 'const el = <div title="Rello CRM" />;', filename: SRC, errors: [legacy("Rello")] },
    { code: 'const el = <img alt="Rello logo" />;', filename: SRC, errors: [legacy("Rello")] },
    { code: 'const el = <nav aria-label="Rello navigation" />;', filename: SRC, errors: [legacy("Rello")] },
    { code: 'const el = <input placeholder="Search Rello" />;', filename: SRC, errors: [legacy("Rello")] },
    { code: 'const el = <meta content="Rello CRM for loan officers" />;', filename: SRC, errors: [legacy("Rello")] },
    { code: 'const el = <img alt="Rallyroo logo" />;', filename: SRC, errors: [typed("Rallyroo")] },
    { code: 'const el = <Card heading="Open in Rello" />;', filename: SRC, errors: [legacy("Rello")] },
    { code: 'const el = <div title={"Rello"} />;', filename: SRC, errors: [legacy("Rello")] },

    // ── string and template literals ──────────────────────────────────────
    { code: 'const n = tenant?.tenantName || "Rello";', filename: LIB, errors: [legacy("Rello")] },
    { code: 'const from = "Rello <noreply@rello.app>";', filename: LIB, errors: [legacy("Rello")] },
    { code: 'export const metadata = { title: "Dashboard | Rello" };', filename: SRC, errors: [legacy("Rello")] },
    { code: "const s = `View in Rello CRM for ${lead.name}`;", filename: LIB, errors: [legacy("Rello")] },
    { code: "const s = `${a} Rello ${b} Rello`;", filename: LIB, errors: [legacy("Rello"), legacy("Rello")] },
    { code: 'const s = "Rello-branded page";', filename: LIB, errors: [legacy("Rello")] },
    { code: 'const s = "RELLO PLATFORM";', filename: LIB, errors: [legacy("RELLO")] },
    { code: 'const s = "Sent by Rallyroo";', filename: LIB, errors: [typed("Rallyroo")] },
    { code: "const s = `RallyRoo ${x}`;", filename: LIB, errors: [typed("RallyRoo")] },
    { code: 'toast.success("Saved to Rello");', filename: SRC, errors: [legacy("Rello")] },
    { code: 'return NextResponse.json({ message: "Rello is updating" });', filename: LIB, errors: [legacy("Rello")] },
    { code: 'const labels = ["Rello", "Milo"];', filename: LIB, errors: [legacy("Rello")] },
    { code: 'const s = "Open Rello.";', filename: LIB, errors: [legacy("Rello")] },
    { code: 'const s = "Rello/Milo sync";', filename: LIB, errors: [legacy("Rello")] },
    // A log call's argument is exempt; a visible string elsewhere in the same function is not.
    {
      code: 'function f() { console.error("Rello failed"); return "Try Rello again"; }',
      filename: LIB,
      errors: [legacy("Rello")],
    },
    // A file whose name merely contains "test" is still shipped code.
    { code: 'const s = "Rello CRM";', filename: "src/app/api/webhooks/[id]/test/route.ts", errors: [legacy("Rello")] },
    { code: 'const s = "Rello CRM";', filename: "src/lib/latest.ts", errors: [legacy("Rello")] },
    // ── (a) compounds: the legacy name followed by an uppercase letter or digit ──
    { code: "const el = <h1>RelloCRM</h1>;", filename: SRC, errors: [legacy("Rello")] },
    { code: 'const w = "RelloCRM";', filename: LIB, errors: [legacy("Rello")] },
    { code: 'const w = "Open RelloHub now";', filename: LIB, errors: [legacy("Rello")] },
    { code: 'const w = "Rello2 is here";', filename: LIB, errors: [legacy("Rello")] },
    { code: 'const w = "RELLO2 PLATFORM";', filename: LIB, errors: [legacy("RELLO")] },
    { code: "const w = `View in RelloCRM ${x}`;", filename: LIB, errors: [legacy("Rello")] },
    { code: "const el = <p>RallyrooHub</p>;", filename: SRC, errors: [typed("Rallyroo")] },

    // ── (b) decoded values: entities and escapes that render the name ─────
    { code: "const el = <h1>R&#101;llo</h1>;", filename: SRC, errors: [legacy("Rello")] },
    { code: "const el = <h1>R&#x65;llo HQ</h1>;", filename: SRC, errors: [legacy("Rello")] },
    { code: 'const el = <h1>{"R\\u0065llo"}</h1>;', filename: SRC, errors: [legacy("Rello")] },
    { code: 'const s = "R\\u0065llo CRM";', filename: LIB, errors: [legacy("Rello")] },
    { code: "const s = `R\\x65llo ${x}`;", filename: LIB, errors: [legacy("Rello")] },
    { code: 'const s = "Rel\\u200Blo";', filename: LIB, errors: [legacy("Rello")] },
    { code: "const email = { html: `<h1>R&#101;llo</h1>` };", filename: LIB, errors: [legacy("Rello")] },
    { code: "const email = { html: `<p>${greeting}</p><p>The R&#101;llo team</p>` };", filename: LIB, errors: [legacy("Rello")] },
    { code: 'const html = "<p>R&#101;llo</p>";', filename: LIB, errors: [legacy("Rello")] },
    { code: 'const el = <img alt="R&#101;llo logo" />;', filename: SRC, errors: [legacy("Rello")] },
    // Locations stay exact when an entity sits elsewhere in the text.
    {
      code: "const el = <p>Milo &amp; Rello</p>;",
      filename: SRC,
      errors: [{ messageId: "legacyBrand", data: { found: "Rello" }, line: 1, column: 26, endColumn: 31 }],
    },
    {
      code: "const el = <p>R&#101;llo</p>;",
      filename: SRC,
      errors: [{ messageId: "legacyBrand", data: { found: "Rello" }, line: 1, column: 15, endColumn: 25 }],
    },

    // ...and when a JS escape sits before it, or spells it.
    {
      code: 'const s = "a\\u2192 Rello";',
      filename: LIB,
      errors: [{ messageId: "legacyBrand", data: { found: "Rello" }, line: 1, column: 20, endColumn: 25 }],
    },
    {
      code: 'const s = "R\\u0065llo";',
      filename: LIB,
      errors: [{ messageId: "legacyBrand", data: { found: "Rello" }, line: 1, column: 12, endColumn: 22 }],
    },
    {
      code: "const s = `Hi\\n\\nRello's Milo \\u2014 Rello`;",
      filename: LIB,
      errors: [
        { messageId: "legacyBrand", data: { found: "Rello" }, line: 1, column: 18 },
        { messageId: "legacyBrand", data: { found: "Rello" }, line: 1, column: 38 },
      ],
    },

    // ── (c) RELLO shown in rendered JSX reports; the routing exemption is outside JSX ──
    { code: 'const el = <h1>{"RELLO"}</h1>;', filename: SRC, errors: [legacy("RELLO")] },
    { code: 'const el = <h1>{ok ? "RELLO" : "Milo"}</h1>;', filename: SRC, errors: [legacy("RELLO")] },
    { code: "const el = <h1>{`RELLO`}</h1>;", filename: SRC, errors: [legacy("RELLO")] },
    { code: "const el = <p>RELLO</p>;", filename: SRC, errors: [legacy("RELLO")] },
    { code: 'const el = <h1>{"rello"}</h1>;', filename: SRC, errors: [legacy("rello")] },
    { code: "const el = <p>Welcome to rello</p>;", filename: SRC, errors: [legacy("rello")] },
    { code: 'const el = <div title="RELLO" />;', filename: SRC, errors: [legacy("RELLO")] },

    // ── (d) props on Capitalized components report (only key/ref/className/data-* exempt) ──
    { code: 'const el = <Badge id="Rello" />;', filename: SRC, errors: [legacy("Rello")] },
    { code: 'const el = <Badge name="Rello CRM" />;', filename: SRC, errors: [legacy("Rello")] },
    { code: 'const el = <Badge id={"Rello"} />;', filename: SRC, errors: [legacy("Rello")] },
    { code: 'const el = <Ui.Card type="Rello" />;', filename: SRC, errors: [legacy("Rello")] },

    // ── (e) Error / throw messages report: they reach screens (measured 13 in the hub) ──
    { code: 'throw new Error("Rello API returned 500");', filename: LIB, errors: [legacy("Rello")] },
    { code: "const e = new Error(`Rello lead ${id} missing`);", filename: LIB, errors: [legacy("Rello")] },
    { code: 'throw new TypeError("Rello tenant missing");', filename: LIB, errors: [legacy("Rello")] },
    { code: 'throw new RelloApiError("Rello rejected the key");', filename: LIB, errors: [legacy("Rello")] },
    { code: 'throw "Rello is down";', filename: LIB, errors: [legacy("Rello")] },
    { code: 'return Promise.reject(new Error("Rello down"));', filename: LIB, errors: [legacy("Rello")] },
    {
      code: 'function Page() { try { throw new Error("Rello unavailable"); } catch (e) { return <p>{e.message}</p>; } }',
      filename: SRC,
      errors: [legacy("Rello")],
    },

    // An allowlist that does not match the file leaves the rule on.
    {
      code: 'const s = "Rello CRM";',
      filename: "src/lib/email/index.ts",
      options: [{ allow: ["src/app/legal/**"] }],
      errors: [legacy("Rello")],
    },
  ],
});
