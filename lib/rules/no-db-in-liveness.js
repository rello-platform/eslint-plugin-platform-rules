"use strict";

/**
 * @fileoverview Forbid a database client (Prisma) from reaching a liveness
 * health-check route module (`**​/health/route.ts`, covering both the bare
 * `app/health/route.ts` and `app/api/health/route.ts` liveness surfaces) —
 * whether imported directly OR through a chain of in-repo helper modules.
 *
 * Any DB access on the frequently-polled liveness path issues a query on every
 * health ping, which resets Neon's autosuspend timer and pins compute awake 24/7
 * — the always-on-compute cost bleed (7 projects ≈ 100% active, ~$/mo each).
 * Liveness MUST be DB-free; the deep DB / pipeline checks belong in the on-demand
 * `/api/health/ready` route, which this rule deliberately does NOT match.
 *
 * A-111 (2026-09-16): the rule originally inspected only the liveness route's
 * OWN import specifiers — a DB client reached through any `@/lib/*` helper (the
 * route imports `@/lib/health-metrics`, which imports `@/lib/db`) was invisible,
 * so the poll pinned Neon awake with a clean-looking lint. The rule now walks the
 * transitive import closure of the route's local imports (relative `./`/`../` and
 * the `@/` alias), reading each module from disk, bounded in depth and cycle-safe,
 * and reports the first chain that reaches a forbidden DB source. Bare-package
 * imports (e.g. `@prisma/client`) are leaves — checked, never followed.
 *
 * Realizes: drift class fixed by the NEON-AUTOSUSPEND health-DB-free sweep (7-repo
 * consolidation 2026-06-04). Codified per `BUILD-|-WORKSTREAM/
 * PLATFORM-COST-LEDGER-RECONCILIATION/SPEC-NEON-AUTOSUSPEND-DURABLE-FIX-060426.md`.
 */

const fs = require("fs");
const path = require("path");

// Canonical liveness route path: ONLY `app/health/route.ts` (bare) and
// `app/api/health/route.ts` — the routes the health-check sweep polls every ~60s.
// Deliberately does NOT match `app/api/health/ready/route.ts` (deep readiness), and
// NOT nested admin/diagnostic health routes (e.g. `app/api/admin/lab/health/route.ts`,
// `app/api/admin/apps/[slug]/health/route.ts`, `app/api/admin/engines/health/route.ts`),
// which are auth-gated, on-demand, and may legitimately query the DB.
const LIVENESS_ROUTE_RE = /\/app\/(api\/)?health\/route\.(ts|tsx|js|jsx)$/;

// Forbidden DB-client import sources: the @prisma scope, a bare `prisma`, and the
// repo db wrappers `@/lib/db` / `@/lib/prisma` (and their relative `../lib/db` forms).
const FORBIDDEN_SOURCE_RE = /(^@prisma\/)|(^prisma$)|(^@\/lib\/(db|prisma)$)|(\/lib\/(db|prisma)$)/;

// Module extensions tried when resolving a specifier to a file on disk, and the
// index forms tried when a specifier resolves to a directory.
const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const DEFAULT_MAX_DEPTH = 16;

function isLivenessRoute(filename) {
  return typeof filename === "string" && LIVENESS_ROUTE_RE.test(filename.replace(/\\/g, "/"));
}

function isForbiddenSource(source, extra) {
  if (typeof source !== "string") return false;
  if (FORBIDDEN_SOURCE_RE.test(source)) return true;
  return !!extra && extra.has(source);
}

/** A relative (`./`, `../`) or `@/`-aliased specifier points at an in-repo file. */
function isLocalSpecifier(source) {
  return typeof source === "string" && (source.startsWith(".") || source.startsWith("@/"));
}

/**
 * The `@/` alias root. `@/*` maps to a repo's source base (commonly `<root>/src`
 * or the repo root). Derive it from the liveness route path — everything up to
 * the `/app/` segment that the route lives under — unless an explicit
 * `aliasRoot` option overrides it.
 */
function deriveAliasRoot(routeFile, optionRoot) {
  if (optionRoot) return path.resolve(optionRoot);
  const norm = routeFile.replace(/\\/g, "/");
  const m = norm.match(/^(.*?)\/app\/(?:api\/)?health\/route\.(?:ts|tsx|js|jsx)$/);
  return m ? m[1] : path.dirname(routeFile);
}

/**
 * Resolve a relative / `@/` specifier to an absolute file path on disk, trying
 * the module extensions and `/index.*` forms. Returns null when nothing exists
 * (a bare package, or a file the resolver cannot see — treated as a leaf).
 */
function resolveLocal(source, fromFile, aliasRoot) {
  let base;
  if (source.startsWith("@/")) {
    base = path.join(aliasRoot, source.slice(2));
  } else if (source.startsWith(".")) {
    base = path.resolve(path.dirname(fromFile), source);
  } else {
    return null;
  }
  const candidates = [];
  if (path.extname(base) && fs.existsSync(base)) return base;
  for (const ext of RESOLVE_EXTENSIONS) candidates.push(base + ext);
  for (const ext of RESOLVE_EXTENSIONS) candidates.push(path.join(base, "index" + ext));
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch {
      /* unreadable — keep trying */
    }
  }
  return null;
}

// Import-source extractor: static `import`/`export … from`, dynamic `import()`,
// and CommonJS `require()`. A per-file cache keyed by absolute path keeps the
// closure walk cheap across the several import nodes of one route.
const IMPORT_RE = /\bimport\s+(?:[^'"]*?\bfrom\s*)?["']([^"']+)["']/g;
const EXPORT_FROM_RE = /\bexport\s+(?:[^'"]*?\bfrom\s*)["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const REQUIRE_RE = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
const _importCache = new Map();

function importSourcesOf(file) {
  if (_importCache.has(file)) return _importCache.get(file);
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    _importCache.set(file, []);
    return [];
  }
  const sources = new Set();
  for (const re of [IMPORT_RE, EXPORT_FROM_RE, DYNAMIC_IMPORT_RE, REQUIRE_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) sources.add(m[1]);
  }
  const out = [...sources];
  _importCache.set(file, out);
  return out;
}

/**
 * Walk the transitive import closure starting at `startFile`. Returns the chain
 * of specifiers from the route's import down to the first forbidden DB source,
 * or null when the closure is DB-free. Cycle-safe (visited set) and bounded
 * (maxDepth). Only local specifiers are followed; a forbidden source is caught
 * at any edge, package or local.
 */
function taintChain(startFile, aliasRoot, extra, maxDepth) {
  const visited = new Set();
  // stack entries: { file, chain }
  const stack = [{ file: startFile, chain: [] }];
  while (stack.length) {
    const { file, chain } = stack.pop();
    if (visited.has(file) || chain.length > maxDepth) continue;
    visited.add(file);
    for (const source of importSourcesOf(file)) {
      const nextChain = chain.concat(source);
      if (isForbiddenSource(source, extra)) return nextChain;
      if (isLocalSpecifier(source)) {
        const resolved = resolveLocal(source, file, aliasRoot);
        if (resolved && !visited.has(resolved)) stack.push({ file: resolved, chain: nextChain });
      }
    }
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid Prisma/DB-client imports from reaching a liveness health route (**/health/route.ts) — directly or through the transitive import closure of its helpers — so the health poll cannot pin Neon compute awake (always-on-compute cost bleed). Deep checks belong in /api/health/ready.",
      recommended: true,
      url: "https://github.com/rello-platform/eslint-plugin-platform-rules#no-db-in-liveness",
    },
    schema: [
      {
        type: "object",
        properties: {
          additionalForbiddenSources: {
            type: "array",
            items: { type: "string" },
            description: "Extra exact import sources to forbid in liveness routes (and anywhere in their closure).",
          },
          aliasRoot: {
            type: "string",
            description:
              "Absolute base directory the `@/` alias maps to. Defaults to the route's source base (the path up to its `/app/` segment).",
          },
          maxDepth: {
            type: "number",
            description: "Maximum transitive import depth to follow (default 16).",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      dbInLiveness:
        "DB-client import '{{source}}' is forbidden in the liveness route '{{filename}}'. Liveness MUST be DB-free — a query here pins Neon compute awake on every health ping (always-on-compute cost bleed). Move deep checks to /api/health/ready.",
      dbInLivenessTransitive:
        "The liveness route '{{filename}}' reaches a DB client through '{{source}}' (chain: {{chain}}). Liveness MUST be DB-free — a query on the health poll pins Neon compute awake (always-on-compute cost bleed). Break the import chain or move deep checks to /api/health/ready.",
    },
  },

  create(context) {
    const filename =
      typeof context.getFilename === "function" ? context.getFilename() : context.filename;
    if (!isLivenessRoute(filename)) return {};

    const options = (context.options && context.options[0]) || {};
    const extra = new Set(options.additionalForbiddenSources || []);
    const aliasRoot = deriveAliasRoot(filename, options.aliasRoot);
    const maxDepth = typeof options.maxDepth === "number" ? options.maxDepth : DEFAULT_MAX_DEPTH;

    function check(node, source) {
      if (typeof source !== "string") return;
      // Direct forbidden import — the original, unchanged behavior.
      if (isForbiddenSource(source, extra)) {
        context.report({ node, messageId: "dbInLiveness", data: { source, filename } });
        return;
      }
      // A-111: follow a local helper's transitive closure. A package import
      // (not local, not forbidden) is a leaf and cannot reach an in-repo DB
      // wrapper, so it is not walked.
      if (!isLocalSpecifier(source)) return;
      const resolved = resolveLocal(source, filename, aliasRoot);
      if (!resolved) return;
      const chain = taintChain(resolved, aliasRoot, extra, maxDepth);
      if (chain) {
        context.report({
          node,
          messageId: "dbInLivenessTransitive",
          data: { source, filename, chain: [source].concat(chain).join(" → ") },
        });
      }
    }

    return {
      // `import { prisma } from "@/lib/db"` / `import x from "@/lib/helper"`
      ImportDeclaration(node) {
        check(node, node.source && node.source.value);
      },
      // dynamic `import("@/lib/db")`
      ImportExpression(node) {
        if (node.source && node.source.type === "Literal") check(node, node.source.value);
      },
      // CommonJS `require("@/lib/db")`
      CallExpression(node) {
        const callee = node.callee;
        if (!callee || callee.type !== "Identifier" || callee.name !== "require") return;
        const arg = node.arguments && node.arguments[0];
        if (arg && arg.type === "Literal") check(node, arg.value);
      },
    };
  },
};

module.exports.LIVENESS_ROUTE_RE = LIVENESS_ROUTE_RE;
module.exports.FORBIDDEN_SOURCE_RE = FORBIDDEN_SOURCE_RE;
