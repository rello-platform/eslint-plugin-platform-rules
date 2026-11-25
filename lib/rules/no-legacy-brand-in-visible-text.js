"use strict";

/**
 * @fileoverview Refuses the product name typed by hand into a visible string.
 *
 * The product is renamed Rello → Rallyroo (PLATFORM-RENAME-RALLYROO, Phase 2).
 * Visible text reads the name from ONE place, `PLATFORM_BRAND.name` in
 * `@rello-platform/slugs`, so the old name cannot creep back and a later
 * rename is one package release.
 *
 * Reports, in JSX text, visible JSX string attributes and string/template
 * literals:
 *   - the legacy brand as a whole word, "Rello" or "RELLO" (legacyBrand);
 *   - the new brand typed by hand in any non-lowercase spelling: "Rallyroo",
 *     "RallyRoo", "RALLYROO" (handTypedBrand). Lowercase "rallyroo" is the
 *     domain/slug form and is not reported.
 *
 * Does NOT report (internal names stay "Rello"):
 *   - arguments of log and throw calls: console.*, logger.* / log.* / *Logger.*,
 *     `throw <anything>`, `new Error(...)` and any `new *Error(...)`;
 *   - import/export sources, `import()`, `require()`, `vi.mock()`/`jest.mock()`;
 *   - object/class/interface keys, identifiers, comments, TS literal types;
 *   - the lowercase `rello` slug and the bare `RELLO` routing identifier;
 *   - hostnames, URLs, email addresses and paths (domain-phase work);
 *   - header names (`X-Rello-…`) and env var names (`RELLO_…`);
 *   - comparison operands, `case` tests and search arguments
 *     (`includes`/`startsWith`/`replace`/…), which match the old name rather
 *     than show it;
 *   - SQL / style tagged templates;
 *   - non-visible JSX attributes (className, id, key, href, src, data-*, …);
 *   - tests, specs, mocks, fixtures and stories (by file name: *.test.*,
 *     *.pg-test.*, *.node-test.*, *.test-helper.*, *.testkit.*, *.spec.*,
 *     *.fixture(s).*, *.stories.*, __tests__/, __fixtures__/, __mocks__/),
 *     and files matching the `allow` globs.
 *
 * No autofix: the fix is an import plus an expression, and which field
 * (name / domain / supportEmail) is right is the author's call.
 */

const path = require("path");

const FIX_HINT = "use PLATFORM_BRAND.name from @rello-platform/slugs";

// Whole-word candidates. "Word" = letters, digits, underscore: RELLO_API_URL,
// RelloCRM and hellorallyroo never match, while "Rello's", "Rello-branded" and
// "Rello." do. Case-insensitive so every spelling is SEEN; classify() decides.
const BRAND_RE = /(?<![A-Za-z0-9_])(rello|rallyroo)(?![A-Za-z0-9_])/gi;

/** "legacyBrand" | "handTypedBrand" | null (not the brand: slug/domain form or odd casing). */
function classify(found) {
  if (found === "Rello" || found === "RELLO") return "legacyBrand";
  if (found.length === 8 && found !== "rallyroo") return "handTypedBrand";
  return null;
}

// Tokens (whitespace-delimited runs) that are addresses, not prose.
const URL_RE = /:\/\//;
const HOSTNAME_RE = /[A-Za-z0-9-]\.[A-Za-z]{2,}/;
const HEADER_NAME_RE = /^x-[a-z0-9]+(?:-[a-z0-9]+)+$/i;
const PATH_START_RE = /^(?:\/|\.\.?\/|@)/;
const TOKEN_TRIM_RE = /^[("'`<[{]+|[)"'`>\]},;:!?]+$/g;

const LOG_OBJECT_RE = /^(?:console|logger|log|[A-Za-z0-9_]*Logger)$/;
const ERROR_CTOR_RE = /(?:^|[a-z0-9_])Error$/;
const MOCK_OBJECTS = new Set(["vi", "jest"]);
const MOCK_METHODS = new Set(["mock", "doMock", "unmock", "requireActual", "importActual"]);
const SEARCH_METHODS = new Set([
  "includes",
  "startsWith",
  "endsWith",
  "indexOf",
  "lastIndexOf",
  "replace",
  "replaceAll",
  "split",
  "match",
  "matchAll",
  "search",
]);
const COMPARISON_OPS = new Set(["===", "!==", "==", "!="]);
const EXEMPT_TAG_RE = /sql|query|execute|gql|graphql|css|styled|keyframes/i;
const NON_VISIBLE_ATTRS = new Set([
  "className",
  "class",
  "id",
  "key",
  "ref",
  "href",
  "src",
  "srcSet",
  "name",
  "type",
  "role",
  "rel",
  "target",
  "htmlFor",
  "method",
  "action",
  "as",
  "form",
  "testID",
  "style",
]);
const KEY_PARENTS = new Set([
  "Property",
  "MethodDefinition",
  "PropertyDefinition",
  "TSPropertySignature",
  "TSMethodSignature",
  "TSAbstractPropertyDefinition",
  "TSAbstractMethodDefinition",
]);
const SOURCE_PARENTS = new Set([
  "ImportDeclaration",
  "ExportNamedDeclaration",
  "ExportAllDeclaration",
  "ImportExpression",
]);
const TYPE_CONTEXTS = new Set([
  "TSLiteralType",
  "TSTypeAnnotation",
  "TSTypeAliasDeclaration",
  "TSInterfaceBody",
  "TSTypeLiteral",
  "TSExternalModuleReference",
  "TSModuleDeclaration",
  "TSEnumMember",
]);

function isTestPath(filename) {
  if (!filename) return false;
  const f = filename.replace(/\\/g, "/");
  return (
    /(?:^|\/)__(?:tests|fixtures|mocks)__\//.test(f) ||
    // foo.test.ts, foo.pg-test.ts, foo.node-test.ts, foo.test-helper.ts,
    // foo.testkit.ts, foo.spec.tsx, foo.fixture(s).ts, foo.stories.tsx
    /[.-](?:test|spec)(?:s|kit|-helpers?)?\.[cm]?[jt]sx?$/.test(f) ||
    /\.(?:fixtures?|stories)\.[cm]?[jt]sx?$/.test(f)
  );
}

/** Minimal glob → RegExp: `**` any depth, `*` within a segment, `?` one char. */
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const slashAfter = glob[i + 2] === "/";
        re += slashAfter ? "(?:.*/)?" : ".*";
        i += slashAfter ? 2 : 1;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`(?:^|/)${re}$`);
}

function isAllowlisted(filename, cwd, globs) {
  if (!filename || !Array.isArray(globs) || globs.length === 0) return false;
  const abs = filename.replace(/\\/g, "/");
  const rel = path.relative(cwd, filename).replace(/\\/g, "/");
  return globs.some((g) => {
    const re = globToRegExp(String(g).replace(/^\.\//, ""));
    return re.test(rel) || re.test(abs);
  });
}

function memberName(node) {
  if (!node) return null;
  if (node.type === "Identifier" || node.type === "PrivateIdentifier") return node.name;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  return null;
}

function calleeObjectName(callee) {
  if (!callee || callee.type !== "MemberExpression") return null;
  const obj = callee.object;
  if (obj.type === "Identifier") return obj.name;
  if (obj.type === "MemberExpression") return memberName(obj.property);
  return null;
}

function isLogCall(call) {
  const name = calleeObjectName(call.callee);
  return Boolean(name && LOG_OBJECT_RE.test(name));
}

function isErrorConstruction(node) {
  const c = node.callee;
  const name =
    c.type === "Identifier" ? c.name : c.type === "MemberExpression" ? memberName(c.property) : null;
  return Boolean(name && ERROR_CTOR_RE.test(name));
}

/** `require("x")`, `vi.mock("x", …)`, `jest.requireActual("x")`: argument 0 is a module specifier. */
function isModuleSpecifierCall(call) {
  const c = call.callee;
  if (c.type === "Identifier" && c.name === "require") return true;
  if (c.type === "MemberExpression" && c.object.type === "Identifier") {
    return MOCK_OBJECTS.has(c.object.name) && MOCK_METHODS.has(memberName(c.property));
  }
  return false;
}

function tagName(tag) {
  if (tag.type === "Identifier") return tag.name;
  if (tag.type === "MemberExpression") return memberName(tag.property);
  if (tag.type === "CallExpression") return tagName(tag.callee);
  return null;
}

function jsxAttrName(attr) {
  const n = attr.name;
  if (!n) return null;
  if (n.type === "JSXIdentifier") return n.name;
  if (n.type === "JSXNamespacedName") return `${n.namespace.name}:${n.name.name}`;
  return null;
}

function isNonVisibleAttr(name) {
  if (!name) return false;
  return NON_VISIBLE_ATTRS.has(name) || name.startsWith("data-");
}

/**
 * True when a string-bearing node (Literal or TemplateLiteral) sits where its
 * text is not shown to a person: a key, a module specifier, a type, a
 * comparison, or the argument of a log / throw / error constructor.
 */
function isExemptContext(node) {
  const parent = node.parent;
  if (!parent) return false;

  if (KEY_PARENTS.has(parent.type) && parent.key === node) return true;
  if (SOURCE_PARENTS.has(parent.type) && parent.source === node) return true;
  if (parent.type === "BinaryExpression" && COMPARISON_OPS.has(parent.operator)) return true;
  if (parent.type === "SwitchCase" && parent.test === node) return true;
  if (
    parent.type === "CallExpression" &&
    parent.arguments[0] === node &&
    parent.callee.type === "MemberExpression" &&
    SEARCH_METHODS.has(memberName(parent.callee.property))
  ) {
    return true;
  }

  // Walk outward for an enclosing exempt context.
  let child = node;
  let cur = parent;
  while (cur) {
    if (TYPE_CONTEXTS.has(cur.type)) return true;
    switch (cur.type) {
      case "ThrowStatement":
        return true;
      case "NewExpression":
        if (cur.arguments.includes(child) && isErrorConstruction(cur)) return true;
        break;
      case "CallExpression":
        if (cur.arguments.includes(child) && isLogCall(cur)) return true;
        if (cur.arguments[0] === child && isModuleSpecifierCall(cur)) return true;
        break;
      case "TaggedTemplateExpression":
        if (cur.quasi === child && EXEMPT_TAG_RE.test(tagName(cur.tag) || "")) return true;
        break;
      case "JSXAttribute":
        return isNonVisibleAttr(jsxAttrName(cur));
      case "JSXElement":
      case "JSXFragment":
        return false;
      default:
        break;
    }
    child = cur;
    cur = cur.parent;
  }
  return false;
}

/** The whitespace-delimited token around [start, end) in `text`, edge punctuation trimmed. */
function tokenAround(text, start, end) {
  let s = start;
  let e = end;
  while (s > 0 && !/\s/.test(text[s - 1])) s--;
  while (e < text.length && !/\s/.test(text[e])) e++;
  return text.slice(s, e).replace(TOKEN_TRIM_RE, "");
}

function isAddressToken(token) {
  return (
    URL_RE.test(token) ||
    token.includes("@") ||
    HOSTNAME_RE.test(token) ||
    HEADER_NAME_RE.test(token) ||
    PATH_START_RE.test(token)
  );
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Forbid the product name typed into visible text — "Rello" (legacy) or a hand-typed "Rallyroo". Use PLATFORM_BRAND.name from @rello-platform/slugs',
      recommended: false,
      url: "https://github.com/rello-platform/eslint-plugin-platform-rules#no-legacy-brand-in-visible-text",
    },
    schema: [
      {
        type: "object",
        properties: {
          allow: {
            type: "array",
            items: { type: "string", minLength: 1 },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      legacyBrand: 'Visible text says "{{found}}", the old product name — ' + FIX_HINT + ".",
      handTypedBrand:
        'Visible text types the brand by hand as "{{found}}" — ' + FIX_HINT + " instead.",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    const cwd = context.cwd ?? (typeof context.getCwd === "function" ? context.getCwd() : process.cwd());
    const options = context.options[0] || {};
    if (isTestPath(filename)) return {};
    if (isAllowlisted(filename, cwd, options.allow)) return {};

    const sourceCode = context.sourceCode ?? context.getSourceCode();

    /**
     * Report each brand match in `text` (a node's source text starting at
     * source index `offset`). `wholeValue` is the literal's full string value
     * when the node is a single string, used to spot the bare RELLO identifier.
     */
    function scan(text, offset, wholeValue) {
      BRAND_RE.lastIndex = 0;
      let m;
      while ((m = BRAND_RE.exec(text)) !== null) {
        const found = m[0];
        const messageId = classify(found);
        if (!messageId) continue;
        const start = m.index;
        const end = start + found.length;
        if (isAddressToken(tokenAround(text, start, end))) continue;
        // A literal that is exactly "RELLO" is the routing identifier for the
        // `rello` slug (toSourceAppIdentifier), not prose.
        if (found === "RELLO" && typeof wholeValue === "string" && wholeValue.trim() === "RELLO") continue;
        context.report({
          loc: {
            start: sourceCode.getLocFromIndex(offset + start),
            end: sourceCode.getLocFromIndex(offset + end),
          },
          messageId,
          data: { found },
        });
      }
    }

    return {
      JSXText(node) {
        scan(sourceCode.getText(node), node.range[0], undefined);
      },

      Literal(node) {
        if (typeof node.value !== "string") return;
        if (node.parent && node.parent.type === "JSXAttribute") {
          if (isNonVisibleAttr(jsxAttrName(node.parent))) return;
        } else if (isExemptContext(node)) {
          return;
        }
        scan(sourceCode.getText(node), node.range[0], node.value);
      },

      TemplateLiteral(node) {
        if (isExemptContext(node)) return;
        const single = node.quasis.length === 1 ? node.quasis[0].value.cooked : undefined;
        for (const q of node.quasis) {
          scan(sourceCode.getText(q), q.range[0], single);
        }
      },
    };
  },
};

module.exports._internal = { classify, globToRegExp, isAllowlisted, isTestPath };
