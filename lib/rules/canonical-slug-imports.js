"use strict";

/**
 * @fileoverview Forbids hardcoded canonical slug arrays. Canonical slugs MUST
 * be imported from `@rello-platform/slugs` (`APP_SLUGS` / `ENGINE_SLUGS` /
 * `PLATFORM_SLUGS`). Re-deriving the inventory inline produces drift.
 *
 * Realizes: CLAUDE.md §Platform slug conventions.
 *
 * Coexistence with `@rello-platform/slugs/no-legacy-literal`: that rule flags
 * legacy slug literals (`homeready`, `MarketIntel`); this rule flags canonical
 * slug arrays re-declared inline (≥2 canonical literals adjacent in the same
 * array). Different scopes; both ship.
 */

const ENGINE_SLUG_RE = /^(milo|content|property|journey|report|drumbeat-video)-engine$/;
const APP_SLUG_RE = /^(rello|home-ready|home-scout|home-stretch|harvest-home|newsletter-studio|the-drumbeat|open-house-hub|the-oven|market-intel|pathfinder-pro)$/;

function isCanonicalSlug(value) {
  if (typeof value !== "string") return false;
  return ENGINE_SLUG_RE.test(value) || APP_SLUG_RE.test(value);
}

function inferCanonicalImport(name) {
  if (name === "ENGINE_SLUGS" || name === "APP_SLUGS" || name === "PLATFORM_SLUGS") {
    return name;
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hardcoded canonical slug arrays; import APP_SLUGS / ENGINE_SLUGS / PLATFORM_SLUGS from @rello-platform/slugs",
      recommended: true,
      url: "https://github.com/rello-platform/eslint-plugin-platform-rules#canonical-slug-imports",
    },
    fixable: "code",
    schema: [],
    messages: {
      hardcodedSlugArray:
        "Hardcoded canonical slug array — import {{name}} from '@rello-platform/slugs' instead.",
      hardcodedSlugArrayAnonymous:
        "Hardcoded canonical slug array (≥2 canonical slug literals adjacent) — import APP_SLUGS / ENGINE_SLUGS / PLATFORM_SLUGS from '@rello-platform/slugs' instead.",
    },
  },

  create(context) {
    const filename = context.getFilename();
    if (filename.includes("/node_modules/@rello-platform/slugs/")) {
      return {};
    }

    function elementsAreCanonicalSlugs(elements) {
      let count = 0;
      for (const el of elements) {
        if (!el) continue;
        if (el.type !== "Literal") return 0;
        if (!isCanonicalSlug(el.value)) return 0;
        count++;
      }
      return count;
    }

    return {
      ArrayExpression(node) {
        if (node.elements.length < 2) return;
        const matchCount = elementsAreCanonicalSlugs(node.elements);
        if (matchCount < 2) return;

        const parent = node.parent;
        let declName = null;
        if (parent && parent.type === "VariableDeclarator" && parent.id.type === "Identifier") {
          declName = parent.id.name;
        }

        const inferred = declName ? inferCanonicalImport(declName) : null;
        context.report({
          node,
          messageId: inferred ? "hardcodedSlugArray" : "hardcodedSlugArrayAnonymous",
          data: { name: inferred || "APP_SLUGS" },
          fix: inferred
            ? (fixer) => fixer.replaceText(node, inferred)
            : null,
        });
      },
    };
  },
};
