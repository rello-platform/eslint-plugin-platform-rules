"use strict";

/**
 * @fileoverview Forbids empty catch handlers per CLAUDE.md §Error handling.
 *
 * `.catch(() => {})` is FORBIDDEN. Same for `.catch(() => undefined)` /
 * `.catch(() => null)` and `try {...} catch {}` / `try {...} catch (e) {}`
 * empty catch blocks. Every catch must log with operation context.
 *
 * Realizes: CLAUDE.md universal floor (no Class-Level Rule cross-reference).
 */

function isEmptyArrowBody(node) {
  if (node.type !== "ArrowFunctionExpression") return false;
  const body = node.body;
  if (body.type === "BlockStatement" && body.body.length === 0) return true;
  if (
    body.type === "Identifier" &&
    (body.name === "undefined" || body.name === "null")
  ) {
    return true;
  }
  if (body.type === "Literal" && body.value === null) return true;
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow empty catch handlers (.catch(() => {}) or empty catch blocks) — every error path must log with context",
      recommended: true,
      url: "https://github.com/rello-platform/eslint-plugin-platform-rules#no-empty-catches",
    },
    schema: [],
    messages: {
      emptyCatchHandler:
        "Empty .catch() handler is forbidden (CLAUDE.md §Error handling). Log with operation name + entity ID.",
      emptyCatchBlock:
        "Empty catch block is forbidden (CLAUDE.md §Error handling). Log with operation name + entity ID.",
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (!callee || callee.type !== "MemberExpression") return;
        if (!callee.property || callee.property.type !== "Identifier") return;
        if (callee.property.name !== "catch") return;
        if (node.arguments.length === 0) return;
        const handler = node.arguments[0];
        if (isEmptyArrowBody(handler)) {
          context.report({
            node: handler,
            messageId: "emptyCatchHandler",
          });
        }
      },
      CatchClause(node) {
        if (node.body.type === "BlockStatement" && node.body.body.length === 0) {
          context.report({
            node,
            messageId: "emptyCatchBlock",
          });
        }
      },
    };
  },
};
