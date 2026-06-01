# @rello-platform/eslint-plugin-platform-rules

ESLint plugin codifying ten Rello platform drift signals from
`PLATFORM-PATTERNS-CATALOG.md` as mechanical lint rules. Every rule cites the
Class-Level Rule (B / C / D / E / F / G / I / J / K / L) it realizes — see
`PLATFORM-CLASS-LEVEL-RULES.md` for rule bodies.

Spec: `SPEC-PLATFORM-LINT-RULES-AND-HOOKS.md`. This package is drift-prevention
infrastructure #3 of 4 — paired with the canonical rules + catalog as the
third leg of automation.

## Rules

| Rule | Severity (initial) | Class-Level | Realizes |
|---|---|---|---|
| `no-empty-catches` | error | (universal floor) | `.catch(() => {})` is FORBIDDEN per CLAUDE.md §Error handling |
| `canonical-slug-imports` | error | (universal floor) | Hardcoded `["milo-engine", ...]` arrays — import from `@rello-platform/slugs` |
| `no-process-env-secret-compare` | error | Rule I | Bearer-shaped compare against `process.env.*_SECRET` anywhere in tree |
| `no-env-var-bearer-fallback` | error | Rule I | Same drift inside `**/api/**/route.ts`; heuristic fallback-after-validateApiKey detector |
| `no-inline-tab-arrays` | warn (grace) | Rule G | `const TABS = [...]` outside the section's `<section>-tabs.ts` module |
| `no-redeclared-api-response-types` | warn (grace) | Rule E | `interface *Response {}` redeclared in consumer files (canonical owner is the api route) |
| `no-fixture-data-when-upstream-unshipped` | warn (heuristic, permanent) | Rule L | `Math.random()` / improvised zero / "TODO: integrate PR-NNN" in admin api aggregator routes |
| `lead-not-contact` | warn (heuristic) | (universal floor) | `Contact*` identifiers in code references — use `Lead*` (CLAUDE.md §Core principles) |
| `no-module-eval-cross-app-clients` | error | (universal floor) | Top-level `export const X = createXClient(...)` / `new <SDK>Client(...)` reading `process.env` at module eval — use lazy-init `getX()` getter |
| `require-tenantid-in-where` | warn (forcing-function; later → error) | (universal floor) | Prisma query on a tenant-scoped model whose `where` lacks `tenantId` — every query must filter by tenantId (CLAUDE.md §Security & tenant isolation) |

Severity ramping is configured in `@rello-platform/eslint-config`, not here.
This plugin exposes all ten rules; consumers select severities via the
shared config (or override per-repo).

### Recommended config (`.configs.recommended`)

```js
const platformRules = require("@rello-platform/eslint-plugin-platform-rules");
module.exports = [platformRules.configs.recommended];
```

Default severities: 5 error, 5 warn. Use the platform's `@rello-platform/eslint-config/next`
or `/library` exports for the platform-canonical severity table — they
override per the spec's grace-period schedule.

## Suppress-comment convention

Suppression uses ESLint's canonical disable directives. This package does NOT
define a custom suppress directive — earlier rule messages advertised a
`// rello-platform-lint-disable-next-line: ...` form that was never parsed;
v0.2.0 drops that advertised phrasing in favor of the canonical ESLint syntax.

Line-scope:

```js
// eslint-disable-next-line @rello-platform/platform-rules/no-empty-catches -- third-party callback never throws
foo.catch(() => {});
```

Block-scope:

```js
/* eslint-disable @rello-platform/platform-rules/no-empty-catches -- legacy retire path; cleanup tracked in spec X */
// ... block where the rule is disabled ...
/* eslint-enable @rello-platform/platform-rules/no-empty-catches */
```

Reasons MUST cite a concrete justification (in-flight migration, third-party
constraint, etc.). PR review surfaces unjustified suppressions.

## Per-rule docs

### `no-empty-catches`

Forbids `.catch(() => {})` / `.catch(() => undefined)` / `.catch(() => null)`
and `try {...} catch {}` / `try {...} catch (e) {}` empty blocks.

There is no legitimate use case — every error path must log with operation
context. CLAUDE.md §Error handling already binds this; the lint rule
enforces.

### `canonical-slug-imports`

Forbids hardcoded canonical slug arrays (`["milo-engine", "content-engine"]`,
`["rello", "home-ready", ...]`). Detects ≥2 canonical slug literals adjacent
in an `ArrayExpression` — single-string occurrences (`"milo-engine"` as a
route param) are unaffected.

Mechanical autofix replaces the array with `ENGINE_SLUGS` / `APP_SLUGS` /
`PLATFORM_SLUGS` when the variable name matches; otherwise suggestion-only.

Coexists with `@rello-platform/slugs/no-legacy-literal` (different scope —
that rule flags legacy literals like `homeready`; this one flags canonical
arrays re-derived inline).

### `no-process-env-secret-compare`

Repo-wide. Flags `BinaryExpression` where one side reads
`process.env.<X>_SECRET` / `*_API_KEY` / `*_TOKEN` and the other side is a
`Bearer ${...}` template literal interpolating the same env access — or
where one side is `req.headers.get("authorization")` and the other is a
Bearer-shaped template.

False-positive guardrail: only fires on Bearer-shaped templates. Plain
truthiness checks (`process.env.ENABLE_FOO === "true"`) are unaffected.

### `no-env-var-bearer-fallback`

Scope: `**/api/**/route.ts` files only. Combines the direct Bearer-compare
detection (Rule 8 above) with a heuristic fallback detector — if the file
references both `validateApiKey` and `process.env.<X>_SECRET` inside an
`IfStatement` / `TryStatement` / `CatchClause`, fires the heuristic warning
for the env access (separate `messageId: fallbackHeuristic`).

v0.2.0 promotes the heuristic to AST control-flow precision (spec §F7).

### `no-inline-tab-arrays`

Scope: `**/(super-admin)/admin/**/*.{ts,tsx}` ONLY, EXCLUDING the canonical
`<section>-tabs.{ts,tsx}` module itself. Three drift signals:

- `const TABS = [...]` declarator → `inlineTabsArray`
- `type TopLevelTab = ...` redeclared → `redeclaredTopLevelTab`
- `import { TABS } from "./page"` → `siblingTabsImport`

Fix is mechanical-aware (extract to `<section>-tabs.ts` and import) but
requires project knowledge of the canonical module path; no autofix.

### `no-redeclared-api-response-types`

Scope: `**/(super-admin)/**` and `**/components/**`, EXCLUDING `**/api/**/route.{ts,tsx}` (canonical owner). Flags `TSInterfaceDeclaration` whose
name ends in `Response`. Declaration-site only — no cross-file comparison.

### `no-fixture-data-when-upstream-unshipped`

Scope: `**/api/admin/**/route.{ts,tsx}`. Heuristic — flags candidates,
human reviews. Detects:

- `Math.random()` direct call
- Hardcoded `0` or `100` value with adjacent `TODO|wire calculator|placeholder|FIXME` comment
- Comment matching `/TODO.*(integrate|wire).*(PR-?\d+|when shipped|when ready)/i`
- `if (process.env.ENABLE_REAL_*)` feature-flag-toggled placeholder

Stays at `warn` permanently per spec (Rule L compliance is human-judged).

### `lead-not-contact`

Heuristic. Flags `Identifier` nodes matching `^([A-Za-z0-9_]*)([Cc])ontact(s|Id|Ids)?$`. Exempt:

- Identifiers prefixed `legacy` / `Legacy` / `LEGACY_`
- Files under `**/__tests__/**`, `**/*.test.{ts,tsx}`, `**/*.spec.{ts,tsx}`, `**/__fixtures__/**`, `**/legacy/**`, `**/migrations/**`
- Identifiers reached through `Literal` / `TemplateLiteral` / `JSXText` / `ImportDeclaration`

Mechanical autofix is **disabled** — cross-file rename would shotgun the
codebase. A guided `lead-not-contact-codemod` ships in v0.2.0 / Phase 3
cleanup spec (spec §F1).

### `no-module-eval-cross-app-clients`

Forbids top-level `export const X = createXClient(...)` and
`export const X = new <SDK>Client(...)` patterns whose initializer reads
`process.env.*` at module evaluation time. The canonical fix is a lazy-init
`getX()` singleton getter (PFP@706529c7, HH@8ecf80e8, Milo@0b9b35bd).

Carve-outs (not flagged):
- `function getX()` lazy-init getters (canonical fix shape)
- `new Proxy({}, {...})` lazy-proxy pattern
- Ternary-gated: `process.env.X ? new XClient(...) : null`
- `PrismaClient` in `src/lib/db.ts` or `src/lib/prisma.ts` (filename whitelist)

SDK constructor allowlist (default): `Anthropic`, `OpenAI`, `Stripe`, `Twilio`,
`Resend`, `Mailgun`, `SendGrid`, `S3Client`, `BigQuery`. Extend via
`additionalSdkClasses` rule option.

### `require-tenantid-in-where`

Flags Prisma queries on tenant-scoped models whose `where` clause does not
filter by `tenantId`. Realizes the universal-floor invariant "every database
query must filter by `tenantId`" — Layer 1 of the 3-layer structural
enforcement locked in `DECISION-WALK-LOCKED-ANSWERS-2026-06-01` item A (Layer 2
= Prisma `$extends` guard; Layer 3 = Postgres RLS). The AST matcher mirrors
`RECON-RELLO-TENANTID-AST-DELTA-AUDIT-FINDINGS-2026-05-18.md` (the ts-morph
matcher that surfaced 868 FAIL sites at Rello@`0831cb98`).

What it matches:
- `<root>.<model>.<op>(...)` where `root` looks like a Prisma client / tx
  client (`prisma`, `db`, `client`, `tx`, `trx`, `txn`, `t`, or any
  `prisma`-prefixed identifier — same heuristic as the recon), `model` is in
  the tenant-scoped set (209 of Rello's 321 schema models carry a `tenantId`
  column), and `op` is a where-bearing op (`findMany`, `findFirst`,
  `findUnique[OrThrow]`, `findFirst[OrThrow]`, `count`, `update`, `updateMany`,
  `delete`, `deleteMany`, `upsert`, `aggregate`, `groupBy`).
- `where` clause present but no `tenantId` key at any depth (top-level, nested
  relation predicate `Lead: { tenantId }`, `AND`/`OR` arrays, conditional /
  logical branches) → **`missingTenantId`**.
- `update`/`updateMany`/`delete`/`deleteMany`/`upsert`/`findFirst[OrThrow]`/
  `findUnique[OrThrow]` with NO `where` clause at all → **`missingWhere`**
  (mass / single-row op with no scoping).

Carve-outs (not flagged):
- The `EXEMPT-UPSTREAM-VERIFIED` inline marker (Wave 1.5 convention,
  established PR #39) — `// tenant-isolation: EXEMPT-UPSTREAM-VERIFIED — <trace>`.
  Recognized as a **per-site** marker (on/adjacent to the call) AND a
  **block-level** marker (anywhere above the call within the same enclosing
  function / transaction block — covers tight cascade-delete clusters under
  one marker, per the Wave 1.5/2 convention).
- A `where` whose value is a spread (`{ ...baseWhere }`) or an opaque
  expression (`where: buildWhere(...)` / a variable) — can't be statically
  resolved at lint time, so treated conservatively as potentially
  tenant-bearing (the recon's EXEMPT-VIA-HELPER / shorthand class). The
  EXEMPT-UPSTREAM-VERIFIED marker is the durable suppression for those.
- Bare `findMany()` / `count()` / `aggregate()` / `groupBy()` with no `where`
  (unbounded reads / platform snapshots — case-by-case in the recon, not a
  blanket flag).
- Non-tenant-scoped models (the 112 models with no `tenantId` column).

`additionalModels` rule option extends the tenant-scoped model set for other
spokes whose schemas differ.

**Severity: ships at `warn`.** It CANNOT arm to `error` until every AST-FAIL
site is tenantId-filtered or marker-exempt — building the rule IS the forcing
function that drives the remaining tenantId waves to green. The flip to
`error` (a hard pre-push gate, consistent with `no-process-env-secret-compare`)
is a later phase once the count reaches zero.

## Severity ramp

Per spec §Phase 3.C: graced rules (`no-inline-tab-arrays`, `no-redeclared-api-response-types`, `lead-not-contact`) flip warn → error after a 14-day soak
or pre-launch completion (whichever later). `no-fixture-data-when-upstream-unshipped` stays at `warn` permanently. The flip is a one-line change in
`@rello-platform/eslint-config/next.mjs` — version-bumped to v0.7.0, fanned
out per Phase 2 recipe.

## Testing

```bash
npm test
```

Each rule has a positive (rule fires) + negative (rule does not fire) test
fixture under `tests/`. Tests run against ESLint's bundled `RuleTester`.

## Cross-references

- `PLATFORM-PATTERNS-CATALOG.md` — drift signals, quoted verbatim per `feedback-prompt-spec-contract-quoting`.
- `PLATFORM-CLASS-LEVEL-RULES.md` — rule bodies (A–L).
- `~/.claude/CLAUDE.md` — Universal Invariants; CMF-07 lint candidates.
- `SPEC-PLATFORM-LINT-RULES-AND-HOOKS.md` — implementation spec.
