"use strict";

/**
 * @fileoverview Forbids env-var Bearer fallback alongside `validateApiKey()`
 * inside `**\/api/**\/route.ts`. The dual-path defeats Rule I (Path A inter-
 * app auth): validateApiKey() handles the canonical ApiKey table check;
 * adding a `process.env.<X>_SECRET` Bearer-compare fallback bypasses tenant
 * scoping, per-pair isolation, lastUsedAt attribution, and revocation.
 *
 * Realizes: PLATFORM-CLASS-LEVEL-RULES.md Rule I.
 *
 * v0.1.0 implementation:
 *   - AST-precise direct Bearer-compare detection (BinaryExpression with
 *     authorization header or env-secret access compared to Bearer template).
 *   - Heuristic fallback-after-validateApiKey detector: scans the file for a
 *     `validateApiKey` Identifier; if one is present AND the file also contains
 *     a `process.env.<X>_SECRET` reference within an IfStatement / TryStatement
 *     descendant, fires a separate warning. (Promotion to AST control-flow
 *     precision deferred to v0.2.0 per spec §Follow-up F7.)
 */

const SECRET_NAME_RE = /(SECRET|API_KEY|TOKEN)$/;

function isProcessEnvSecretAccess(node) {
  if (!node || node.type !== "MemberExpression") return false;
  const obj = node.object;
  if (
    !obj ||
    obj.type !== "MemberExpression" ||
    !obj.object ||
    obj.object.type !== "Identifier" ||
    obj.object.name !== "process" ||
    !obj.property ||
    obj.property.type !== "Identifier" ||
    obj.property.name !== "env"
  ) {
    return false;
  }
  const prop = node.property;
  if (!prop || prop.type !== "Identifier") return false;
  return SECRET_NAME_RE.test(prop.name);
}

function templateContainsBearer(node) {
  if (!node || node.type !== "TemplateLiteral") return false;
  for (const quasi of node.quasis) {
    const raw = quasi.value && (quasi.value.cooked || quasi.value.raw);
    if (typeof raw === "string" && /Bearer\s/.test(raw)) return true;
  }
  return false;
}

function templateInterpolatesEnvSecret(node) {
  if (!node || node.type !== "TemplateLiteral") return false;
  for (const expr of node.expressions) {
    if (isProcessEnvSecretAccess(expr)) return true;
  }
  return false;
}

function isAuthorizationHeaderRead(node) {
  if (!node || node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (!callee || callee.type !== "MemberExpression") return false;
  if (!callee.property || callee.property.type !== "Identifier") return false;
  if (callee.property.name !== "get") return false;
  if (node.arguments.length !== 1) return false;
  const arg = node.arguments[0];
  if (!arg || arg.type !== "Literal" || typeof arg.value !== "string") return false;
  return arg.value.toLowerCase() === "authorization";
}

function isInRouteHandler(filename) {
  return /\/api\/.*route\.(ts|tsx|js|jsx)$/.test(filename);
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow env-var Bearer fallback in api route handlers — use validateApiKey() with ApiKey table only",
      recommended: true,
      url: "https://github.com/rello-platform/eslint-plugin-platform-rules#no-env-var-bearer-fallback",
    },
    schema: [],
    messages: {
      bearerCompareInRoute:
        "Bearer-shaped compare against process.env secret in api route handler violates Rule I. Use validateApiKey() with an ApiKey row.",
      fallbackHeuristic:
        "Heuristic: api route handler references both validateApiKey() and process.env.{{name}} (suspected fallback path). Audit and confirm the env-var path is not a Bearer-fallback that bypasses the ApiKey row.",
    },
  },

  create(context) {
    const filename = context.getFilename();
    if (!isInRouteHandler(filename)) return {};

    let sawValidateApiKey = false;
    const envSecretRefs = [];

    return {
      Identifier(node) {
        if (node.name === "validateApiKey") sawValidateApiKey = true;
      },
      MemberExpression(node) {
        if (isProcessEnvSecretAccess(node)) {
          let scopeNode = node;
          while (scopeNode.parent) {
            if (
              scopeNode.parent.type === "IfStatement" ||
              scopeNode.parent.type === "TryStatement" ||
              scopeNode.parent.type === "CatchClause"
            ) {
              envSecretRefs.push({ node, name: node.property.name });
              break;
            }
            scopeNode = scopeNode.parent;
          }
        }
      },
      BinaryExpression(node) {
        if (node.operator !== "===" && node.operator !== "==") return;
        const sides = [node.left, node.right];
        const envSide = sides.find(isProcessEnvSecretAccess);
        const otherSide = sides.find((s) => s !== envSide);
        const headerSide = sides.find(isAuthorizationHeaderRead);
        const headerOther = sides.find((s) => s !== headerSide);

        const otherIsBearer =
          otherSide &&
          templateContainsBearer(otherSide) &&
          templateInterpolatesEnvSecret(otherSide);
        const headerOtherIsBearer =
          headerOther &&
          templateContainsBearer(headerOther) &&
          templateInterpolatesEnvSecret(headerOther);

        if ((envSide && otherIsBearer) || (headerSide && headerOtherIsBearer)) {
          context.report({ node, messageId: "bearerCompareInRoute" });
        }
      },
      "Program:exit"() {
        if (!sawValidateApiKey) return;
        for (const ref of envSecretRefs) {
          context.report({
            node: ref.node,
            messageId: "fallbackHeuristic",
            data: { name: ref.name },
          });
        }
      },
    };
  },
};
