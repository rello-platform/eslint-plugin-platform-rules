"use strict";

/**
 * @fileoverview HEURISTIC rule (warn-only) — flags identifiers matching
 * `Contact*` shape in code references. Per CLAUDE.md §Core principles, code
 * references use `lead`; "contact" is fine in UI text only. Identifiers
 * inside string literals, JSX text, tests, fixtures, legacy/migration paths
 * are exempt.
 *
 * Realizes: CLAUDE.md universal floor (no Class-Level Rule cross-reference).
 *
 * False-positive risk acknowledged — first-pass run likely surfaces N>20+
 * across the platform. Cleanup is its own follow-up spec (F1).
 *
 * Mechanical autofix is disabled: cross-file rename would shotgun the
 * codebase. Manual codemod ships in v0.2.0 / Phase 3 cleanup.
 */

const CONTACT_NAME_RE = /^([A-Za-z0-9_]*)([Cc])ontact(s|Id|Ids)?$/;
const LEGACY_PREFIX_RE = /^(legacy|Legacy|LEGACY_)/;

function isExemptPath(filename) {
  if (!filename) return true;
  if (/\/__tests__\//.test(filename)) return true;
  if (/\.test\.(tsx?|jsx?)$/.test(filename)) return true;
  if (/\.spec\.(tsx?|jsx?)$/.test(filename)) return true;
  if (/\/__fixtures__\//.test(filename)) return true;
  if (/\/legacy\//.test(filename)) return true;
  if (/\/migrations\//.test(filename)) return true;
  if (/prisma\/migrations\//.test(filename)) return true;
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "(Heuristic, warn) Forbid `Contact*` identifiers in code references — use `lead` (CLAUDE.md §Core principles). UI text strings + JSX text + tests/fixtures/legacy paths exempt",
      recommended: false,
      url: "https://github.com/rello-platform/eslint-plugin-platform-rules#lead-not-contact",
    },
    schema: [],
    messages: {
      contactIdentifier:
        "Identifier `{{name}}` matches Contact-shape — use Lead-shape (CLAUDE.md §Core principles: code refs use `lead`; UI text fine).",
    },
  },

  create(context) {
    const filename = context.getFilename();
    if (isExemptPath(filename)) return {};

    function isInsideStringContext(node) {
      let parent = node.parent;
      while (parent) {
        const t = parent.type;
        if (t === "Literal" || t === "TemplateLiteral") return true;
        if (t === "JSXText") return true;
        if (
          t === "JSXAttribute" &&
          parent.value &&
          (parent.value.type === "Literal" || parent.value.type === "JSXExpressionContainer")
        ) {
          // Attribute values reach here; we do not blanket-exempt them, fall through.
        }
        if (t === "ImportDeclaration") return true;
        parent = parent.parent;
      }
      return false;
    }

    function check(node) {
      if (!node.name) return;
      const m = node.name.match(CONTACT_NAME_RE);
      if (!m) return;
      if (LEGACY_PREFIX_RE.test(node.name)) return;
      if (isInsideStringContext(node)) return;
      context.report({
        node,
        messageId: "contactIdentifier",
        data: { name: node.name },
      });
    }

    return {
      Identifier: check,
    };
  },
};
