"use strict";

/**
 * @fileoverview Forbid importing a database client (Prisma) into a liveness
 * health-check route module (`**​/health/route.ts`, which covers both the bare
 * `app/health/route.ts` and `app/api/health/route.ts` liveness surfaces).
 *
 * Any DB access on the frequently-polled liveness path issues a query on every
 * health ping, which resets Neon's autosuspend timer and pins compute awake 24/7
 * — the always-on-compute cost bleed (7 projects ≈ 100% active, ~$/mo each).
 * Liveness MUST be DB-free; the deep DB / pipeline checks belong in the on-demand
 * `/api/health/ready` route, which this rule deliberately does NOT match.
 *
 * Realizes: drift class fixed by the NEON-AUTOSUSPEND health-DB-free sweep (7-repo
 * consolidation 2026-06-04). Codified per `BUILD-|-WORKSTREAM/
 * PLATFORM-COST-LEDGER-RECONCILIATION/SPEC-NEON-AUTOSUSPEND-DURABLE-FIX-060426.md`.
 */

// Liveness route path: `.../health/route.{ts,tsx,js,jsx}`. Matches `app/health/route.ts`
// and `app/api/health/route.ts`, but NOT `app/api/health/ready/route.ts` (the deep
// readiness route legitimately queries the DB).
const LIVENESS_ROUTE_RE = /\/health\/route\.(ts|tsx|js|jsx)$/;

// Forbidden DB-client import sources: the @prisma scope, a bare `prisma`, and the
// repo db wrappers `@/lib/db` / `@/lib/prisma` (and their relative `../lib/db` forms).
const FORBIDDEN_SOURCE_RE = /(^@prisma\/)|(^prisma$)|(^@\/lib\/(db|prisma)$)|(\/lib\/(db|prisma)$)/;

function isLivenessRoute(filename) {
  return LIVENESS_ROUTE_RE.test(filename);
}

function isForbiddenSource(source) {
  return typeof source === "string" && FORBIDDEN_SOURCE_RE.test(source);
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid Prisma/DB-client imports in a liveness health route (**/health/route.ts) — liveness must be DB-free so the health poll cannot pin Neon compute awake (always-on-compute cost bleed). Deep checks belong in /api/health/ready.",
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
            description: "Extra exact import sources to forbid in liveness routes.",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      dbInLiveness:
        "DB-client import '{{source}}' is forbidden in the liveness route '{{filename}}'. Liveness MUST be DB-free — a query here pins Neon compute awake on every health ping (always-on-compute cost bleed). Move deep checks to /api/health/ready.",
    },
  },

  create(context) {
    const filename =
      typeof context.getFilename === "function" ? context.getFilename() : context.filename;
    if (!isLivenessRoute(filename)) return {};

    const options = (context.options && context.options[0]) || {};
    const extra = new Set(options.additionalForbiddenSources || []);

    function check(node, source) {
      if (isForbiddenSource(source) || extra.has(source)) {
        context.report({
          node,
          messageId: "dbInLiveness",
          data: { source, filename },
        });
      }
    }

    return {
      // `import { prisma } from "@/lib/db"`
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
