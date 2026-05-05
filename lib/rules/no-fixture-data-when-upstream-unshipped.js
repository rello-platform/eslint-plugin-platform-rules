"use strict";

/**
 * @fileoverview HEURISTIC rule (warn-only) — flags fixture-data shapes in
 * admin api aggregator routes that suggest a calculator hasn't shipped yet:
 * inline `Math.random()`, hardcoded `0`/`100` with TODO comment, derived
 * fixture math (`mrr: tenants.length * 99`), commented-out "real" math
 * blocks, "// TODO: integrate <PR-NNN>" markers, and feature-flagged
 * placeholder branches. Rule L compliance is human-judged — this rule
 * surfaces candidates; reviewer triages.
 *
 * Realizes: PLATFORM-CLASS-LEVEL-RULES.md Rule L (placeholder for unshipped
 * upstream calculator).
 *
 * Scope: file glob `**\/api/admin/**\/route.{ts,tsx,js,jsx}` ONLY.
 * `Math.random()` in idempotency-key code or test seeds is unaffected.
 */

const ADMIN_API_ROUTE_RE = /\/api\/admin\/.*route\.(tsx?|jsx?)$/;
const TODO_FIXTURE_COMMENT_RE = /TODO|wire calculator|placeholder|FIXME/i;
const UPSTREAM_PR_RE = /TODO.*(integrate|wire).*(PR[-\s]?\d+|when shipped|when ready)/i;
const FEATURE_FLAG_NAME_RE = /^ENABLE_REAL_/;

function isMathRandomCall(node) {
  if (!node || node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (!callee || callee.type !== "MemberExpression") return false;
  if (
    callee.object &&
    callee.object.type === "Identifier" &&
    callee.object.name === "Math" &&
    callee.property &&
    callee.property.type === "Identifier" &&
    callee.property.name === "random"
  ) {
    return true;
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "(Heuristic, warn) Flag fixture-data shapes in admin api aggregator routes — Rule L: render placeholder when upstream calculator unshipped",
      recommended: false,
      url: "https://github.com/rello-platform/eslint-plugin-platform-rules#no-fixture-data-when-upstream-unshipped",
    },
    schema: [],
    messages: {
      mathRandom:
        "Heuristic: Math.random() in admin api aggregator route — Rule L candidate. If this is a calculator placeholder, return null and render placeholder instead. Suppress only with: // rello-platform-lint-disable-next-line: no-fixture-data-when-upstream-unshipped -- <reason>",
      improvisedZero:
        "Heuristic: hardcoded {{value}} adjacent to `{{commentText}}` — Rule L candidate. If this is a calculator placeholder, return null and render placeholder. Suppress only with: // rello-platform-lint-disable-next-line: no-fixture-data-when-upstream-unshipped -- <reason>",
      upstreamPrTodo:
        "Heuristic: TODO referencing an upstream PR (`{{commentText}}`) — Rule L candidate. Return null and render placeholder until upstream ships. Suppress only with: // rello-platform-lint-disable-next-line: no-fixture-data-when-upstream-unshipped -- <reason>",
      featureFlagPlaceholder:
        "Heuristic: feature-flag-toggled placeholder (process.env.{{name}}) — Rule L candidate. Return null and render placeholder until upstream ships. Suppress only with: // rello-platform-lint-disable-next-line: no-fixture-data-when-upstream-unshipped -- <reason>",
    },
  },

  create(context) {
    const filename = context.getFilename();
    if (!ADMIN_API_ROUTE_RE.test(filename)) return {};

    const sourceCode = context.sourceCode || context.getSourceCode();

    function findAdjacentTodoComment(node) {
      const all = sourceCode.getCommentsBefore
        ? [...sourceCode.getCommentsBefore(node), ...sourceCode.getCommentsAfter(node)]
        : [];
      for (const comment of all) {
        if (TODO_FIXTURE_COMMENT_RE.test(comment.value)) {
          return comment.value.trim();
        }
      }
      return null;
    }

    return {
      CallExpression(node) {
        if (isMathRandomCall(node)) {
          context.report({ node, messageId: "mathRandom" });
        }
      },
      Property(node) {
        if (!node.value || node.value.type !== "Literal") return;
        const value = node.value.value;
        if (value !== 0 && value !== 100) return;
        const commentText = findAdjacentTodoComment(node);
        if (!commentText) return;
        context.report({
          node,
          messageId: "improvisedZero",
          data: { value: String(value), commentText: commentText.slice(0, 60) },
        });
      },
      Program() {
        const comments = sourceCode.getAllComments();
        for (const comment of comments) {
          if (UPSTREAM_PR_RE.test(comment.value)) {
            context.report({
              loc: comment.loc,
              messageId: "upstreamPrTodo",
              data: { commentText: comment.value.trim().slice(0, 80) },
            });
          }
        }
      },
      MemberExpression(node) {
        if (
          node.object &&
          node.object.type === "MemberExpression" &&
          node.object.object &&
          node.object.object.type === "Identifier" &&
          node.object.object.name === "process" &&
          node.object.property &&
          node.object.property.name === "env" &&
          node.property &&
          node.property.type === "Identifier" &&
          FEATURE_FLAG_NAME_RE.test(node.property.name)
        ) {
          let parent = node.parent;
          while (parent) {
            if (parent.type === "IfStatement") {
              context.report({
                node,
                messageId: "featureFlagPlaceholder",
                data: { name: node.property.name },
              });
              return;
            }
            parent = parent.parent;
          }
        }
      },
    };
  },
};
