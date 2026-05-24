"use strict";

/**
 * @fileoverview Forbid top-level `export const X = createXClient(...)` and
 * `export const X = new <SDK>Client(...)` whose initializer reads `process.env`
 * at module-eval time. Use a lazy-init `getX()` getter instead — see canonical
 * fix at PFP@706529c7 / HH@8ecf80e8 / Milo@0b9b35bd.
 *
 * Realizes: drift class identified by `MODULE-EVAL-CROSS-APP-CLIENTS-SWEEP-2026-05-18.md`.
 * Codified per `BUILD-|-STANDARD/PLATFORM-LINT-RULE-NO-MODULE-EVAL-CROSS-APP-CLIENTS/`.
 */

const CREATE_CLIENT_RE = /^create[A-Z][A-Za-z0-9]*Client$/;

// SDK constructor allowlist — extend at config time via rule options.
const SDK_CLASS_ALLOWLIST = new Set([
  "Anthropic",
  "OpenAI",
  "Stripe",
  "Twilio",
  "Resend",
  "Mailgun",
  "SendGrid",
  "S3Client",
  "BigQuery",
]);

// File-path whitelist (Prisma's lazy-connect makes module-eval safe).
const PRISMA_FILE_RE = /\/(src\/)?lib\/(db|prisma)\.(ts|tsx|js|jsx)$/;

function isProcessEnvAccess(node) {
  if (!node || node.type !== "MemberExpression") return false;
  const obj = node.object;
  return (
    obj &&
    obj.type === "Identifier" &&
    obj.name === "process" &&
    node.property &&
    ((node.property.type === "Identifier" && node.property.name === "env") ||
      (node.property.type === "Literal" && node.property.value === "env"))
  );
}

function isProcessEnvPropertyAccess(node) {
  // matches `process.env.X` (MemberExpression whose object is `process.env`)
  if (!node || node.type !== "MemberExpression") return false;
  return isProcessEnvAccess(node.object);
}

function containsProcessEnv(node, depth = 0) {
  if (!node || depth > 10) return false; // guard runaway recursion on synthetic ASTs
  if (isProcessEnvPropertyAccess(node)) return true;
  for (const key of Object.keys(node)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    const child = node[key];
    if (!child) continue;
    if (Array.isArray(child)) {
      for (const c of child) {
        if (c && typeof c === "object" && containsProcessEnv(c, depth + 1)) return true;
      }
    } else if (typeof child === "object" && child.type) {
      if (containsProcessEnv(child, depth + 1)) return true;
    }
  }
  return false;
}

function isTernaryGatedClientCtor(initNode) {
  // matches `process.env.X ? new XClient(...) : null` — tolerant pattern.
  if (!initNode || initNode.type !== "ConditionalExpression") return false;
  return isProcessEnvPropertyAccess(initNode.test);
}

function isProxyLazy(initNode) {
  // matches `new Proxy({} as XClient, {...})` — lazy-proxy pattern.
  return (
    initNode &&
    initNode.type === "NewExpression" &&
    initNode.callee &&
    initNode.callee.type === "Identifier" &&
    initNode.callee.name === "Proxy"
  );
}

function flagsCreateXClient(initNode) {
  if (!initNode || initNode.type !== "CallExpression") return false;
  const callee = initNode.callee;
  if (!callee || callee.type !== "Identifier") return false;
  if (!CREATE_CLIENT_RE.test(callee.name)) return false;
  return containsProcessEnv(initNode);
}

function flagsNewSdkClient(initNode, sdkAllowlist) {
  if (!initNode || initNode.type !== "NewExpression") return false;
  const callee = initNode.callee;
  if (!callee || callee.type !== "Identifier") return false;
  if (!sdkAllowlist.has(callee.name)) return false;
  return containsProcessEnv(initNode);
}

function isTopLevel(node) {
  // VariableDeclaration whose parent is Program (top-level) OR ExportNamedDeclaration whose parent is Program.
  if (!node || !node.parent) return false;
  if (node.parent.type === "Program") return true;
  if (
    node.parent.type === "ExportNamedDeclaration" &&
    node.parent.parent &&
    node.parent.parent.type === "Program"
  ) {
    return true;
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow top-level `export const X = createXClient(...)` / `export const X = new <SDK>Client(...)` reading `process.env` at module eval — use a lazy-init `getX()` getter (canonical pattern from PFP@706529c7).",
      recommended: true,
      url: "https://github.com/rello-platform/eslint-plugin-platform-rules#no-module-eval-cross-app-clients",
    },
    schema: [
      {
        type: "object",
        properties: {
          additionalSdkClasses: {
            type: "array",
            items: { type: "string" },
            description: "Additional SDK constructor names to flag (extends default allowlist).",
          },
          allowedFilePatterns: {
            type: "array",
            items: { type: "string" },
            description: "Glob patterns of file paths to skip (extends Prisma defaults).",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      moduleEvalCreateClient:
        "Top-level `{{name}}` reads process.env at module eval — convert to lazy-init `get{{capName}}()` getter per canonical fix (PFP@706529c7, HH@8ecf80e8). Module-eval throws on missing env break Next.js page-data collection + Express server boot.",
      moduleEvalNewSdkClient:
        "Top-level `new {{ctor}}(...)` SDK client reads process.env at module eval — convert to lazy-init getter per canonical fix (Milo@0b9b35bd). SDK constructors that throw on missing creds break CI builds + service boots.",
    },
  },

  create(context) {
    const options = (context.options && context.options[0]) || {};
    const sdkAllowlist = new Set(SDK_CLASS_ALLOWLIST);
    for (const extra of options.additionalSdkClasses || []) sdkAllowlist.add(extra);

    const filename = context.getFilename();
    if (PRISMA_FILE_RE.test(filename)) return {};

    return {
      VariableDeclarator(node) {
        if (!isTopLevel(node.parent)) return;
        const init = node.init;
        if (!init) return;

        // Carve-out 1: ternary-gated tolerant pattern.
        if (isTernaryGatedClientCtor(init)) return;
        // Carve-out 2: lazy-proxy pattern.
        if (isProxyLazy(init)) return;

        if (flagsCreateXClient(init)) {
          const name = init.callee.name;
          const capName = name.replace(/^create/, "").replace(/Client$/, "");
          context.report({
            node,
            messageId: "moduleEvalCreateClient",
            data: { name, capName },
          });
          return;
        }
        if (flagsNewSdkClient(init, sdkAllowlist)) {
          context.report({
            node,
            messageId: "moduleEvalNewSdkClient",
            data: { ctor: init.callee.name },
          });
        }
      },
    };
  },
};
