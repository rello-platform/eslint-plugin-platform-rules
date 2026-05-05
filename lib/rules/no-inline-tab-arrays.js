"use strict";

/**
 * @fileoverview Forbids inline `const TABS = [...]` literals in admin pages
 * outside the canonical `<section>-tabs.{ts,tsx}` module. Per Rule G, Tab 1
 * (the section's canonical tabs module) owns the shared tab inventory; sibling
 * pages MUST import from `<section>-tabs` rather than re-declare locally.
 *
 * Realizes: PLATFORM-CLASS-LEVEL-RULES.md Rule G (Section anchor authoring).
 *
 * Scope: file glob `**\/(super-admin)/admin/**\/*.{ts,tsx}` ONLY. Inline
 * `const TABS = [...]` outside this glob is unaffected. Files that already
 * are the canonical tabs module (filename ends with `-tabs.{ts,tsx}`) are
 * exempt — they are the legitimate declaration site.
 */

const ADMIN_PATH_RE = /\/\(super-admin\)\/admin\//;
const TABS_MODULE_RE = /-tabs\.(tsx?|jsx?)$/;

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow inline TABS = [...] literals + redeclared TopLevelTab type + sibling import from './page' in admin pages — extract to <section>-tabs.ts",
      recommended: true,
      url: "https://github.com/rello-platform/eslint-plugin-platform-rules#no-inline-tab-arrays",
    },
    schema: [],
    messages: {
      inlineTabsArray:
        "Inline `const TABS = [...]` in admin page — extract to <section>-tabs.ts and import (Rule G: Tab 1 owns shared tab constants). Suppress only with: // rello-platform-lint-disable-next-line: no-inline-tab-arrays -- <reason>",
      redeclaredTopLevelTab:
        "Redeclared `type TopLevelTab` — canonical type lives in <section>-tabs.ts (Rule G). Suppress only with: // rello-platform-lint-disable-next-line: no-inline-tab-arrays -- <reason>",
      siblingTabsImport:
        "Importing TABS from './page' violates Rule G — import from './<section>-tabs' instead (canonical tabs module). Suppress only with: // rello-platform-lint-disable-next-line: no-inline-tab-arrays -- <reason>",
    },
  },

  create(context) {
    const filename = context.getFilename();
    if (!ADMIN_PATH_RE.test(filename)) return {};
    if (TABS_MODULE_RE.test(filename)) return {};

    return {
      VariableDeclarator(node) {
        if (
          node.id &&
          node.id.type === "Identifier" &&
          node.id.name === "TABS" &&
          node.init &&
          node.init.type === "ArrayExpression"
        ) {
          context.report({ node, messageId: "inlineTabsArray" });
        }
      },
      TSTypeAliasDeclaration(node) {
        if (node.id && node.id.name === "TopLevelTab") {
          context.report({ node, messageId: "redeclaredTopLevelTab" });
        }
      },
      ImportDeclaration(node) {
        const source = node.source && node.source.value;
        if (source !== "./page") return;
        for (const spec of node.specifiers) {
          if (
            spec.type === "ImportSpecifier" &&
            spec.imported &&
            spec.imported.name === "TABS"
          ) {
            context.report({ node: spec, messageId: "siblingTabsImport" });
          }
        }
      },
    };
  },
};
