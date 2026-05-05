"use strict";

/**
 * @fileoverview Forbids Bearer-shaped compares against `process.env.*_SECRET`
 * / `*_API_KEY` / `*_TOKEN` literals anywhere in the tree. Inter-app auth on
 * Rello-owned endpoints MUST resolve through the `ApiKey` table via
 * `validateApiKey()` — env-var Bearer compares bypass tenant scoping, per-pair
 * isolation, `lastUsedAt` attribution, and revocation.
 *
 * Realizes: PLATFORM-CLASS-LEVEL-RULES.md Rule I (Path A inter-app auth).
 *
 * Distinct from `no-env-var-bearer-fallback`:
 *   - This rule: repo-wide; catches any direct env-var Bearer compare.
 *   - `no-env-var-bearer-fallback`: scoped to **api/route.ts; includes the
 *     "fallback after validateApiKey fails" detector.
 *   - Both ship; overlap is intentional (defense-in-depth).
 *
 * False-positive guardrail: only fires when the compared literal is Bearer-
 * shaped. Plain feature-flag truthiness checks
 * (`process.env.ENABLE_FOO === "true"`) are unaffected.
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

function isBearerShape(node) {
  if (!node) return false;
  if (templateContainsBearer(node) && templateInterpolatesEnvSecret(node)) return true;
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow Bearer-shaped compares against process.env.*_SECRET / *_API_KEY / *_TOKEN — use validateApiKey() (ApiKey table) instead",
      recommended: true,
      url: "https://github.com/rello-platform/eslint-plugin-platform-rules#no-process-env-secret-compare",
    },
    schema: [],
    messages: {
      bearerEnvCompare:
        "Bearer-shaped compare against process.env secret literal violates Rule I (Path A inter-app auth). Use validateApiKey() with an ApiKey table row. Suppress only with: // rello-platform-lint-disable-next-line: no-process-env-secret-compare -- <ApiKey-table cutover gated by spec X>",
    },
  },

  create(context) {
    function checkBinary(node) {
      if (node.operator !== "===" && node.operator !== "==") return;
      const sides = [node.left, node.right];
      const envSide = sides.find(isProcessEnvSecretAccess);
      const otherSide = sides.find((s) => s !== envSide);
      if (envSide && isBearerShape(otherSide)) {
        context.report({ node, messageId: "bearerEnvCompare" });
        return;
      }
      const headerSide = sides.find(isAuthorizationHeaderRead);
      const bearerSide = sides.find((s) => s !== headerSide);
      if (headerSide && isBearerShape(bearerSide)) {
        context.report({ node, messageId: "bearerEnvCompare" });
      }
    }

    return {
      BinaryExpression: checkBinary,
    };
  },
};
