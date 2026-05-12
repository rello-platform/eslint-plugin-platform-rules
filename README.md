# @rello-platform/eslint-plugin-platform-rules

ESLint plugin codifying eight Rello platform drift signals from
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

Severity ramping is configured in `@rello-platform/eslint-config`, not here.
This plugin exposes all eight rules; consumers select severities via the
shared config (or override per-repo).

### Recommended config (`.configs.recommended`)

```js
const platformRules = require("@rello-platform/eslint-plugin-platform-rules");
module.exports = [platformRules.configs.recommended];
```

Default severities: 4 error, 4 warn. Use the platform's `@rello-platform/eslint-config/next`
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
