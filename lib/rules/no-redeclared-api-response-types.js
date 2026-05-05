"use strict";

// @fileoverview Forbids consumer-side redeclaration of `interface *Response`
// types. Canonical owner is the api route file (`app/api/.../route.ts`);
// page components and hooks MUST import the response type from there, not
// redeclare it. Redeclaration is the field-name-drift bug class — a silent
// NaN waiting for one side to rename a field.
//
// Realizes: PLATFORM-CLASS-LEVEL-RULES.md Rule E (canonical type owner).
//
// Scope: declaration-site only. Consumer files under `(super-admin)/` and
// `components/` declaring `interface *Response` are flagged. The canonical
// owner (api route files) is exempt. No cross-file comparison performed —
// the consumer-side declaration is the violation regardless of whether it
// matches the canonical shape.
//
// Other interfaces (DTOs, props types, internal helpers) are unaffected;
// the rule fires only when the interface name ends in "Response".

const RESPONSE_NAME_RE = /Response$/;
const CONSUMER_PATH_RE = /\/\(super-admin\)\/|\/components\//;
const API_ROUTE_RE = /\/api\/.*route\.(tsx?|jsx?)$/;

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow redeclared `interface *Response` types in consumer files; import the canonical type from the api route file instead",
      recommended: true,
      url: "https://github.com/rello-platform/eslint-plugin-platform-rules#no-redeclared-api-response-types",
    },
    schema: [],
    messages: {
      redeclaredResponse:
        "Consumer-side `interface {{name}}` redeclares an api response type — import from the canonical api route file (Rule E). Field-name drift between consumer + route silently NaNs. Suppress only with: // rello-platform-lint-disable-next-line: no-redeclared-api-response-types -- <reason>",
    },
  },

  create(context) {
    const filename = context.getFilename();
    if (API_ROUTE_RE.test(filename)) return {};
    if (!CONSUMER_PATH_RE.test(filename)) return {};

    return {
      TSInterfaceDeclaration(node) {
        const name = node.id && node.id.name;
        if (!name || !RESPONSE_NAME_RE.test(name)) return;
        context.report({
          node,
          messageId: "redeclaredResponse",
          data: { name },
        });
      },
    };
  },
};
