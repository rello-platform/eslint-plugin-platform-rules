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
 *   - the legacy brand as a whole word or a compound, "Rello", "RELLO",
 *     "RelloCRM", "Rello2" (legacyBrand); inside rendered JSX children every
 *     casing counts ("rello", "RELLO");
 *   - the new brand typed by hand in any non-lowercase spelling: "Rallyroo",
 *     "RallyRoo", "RALLYROO" (handTypedBrand). Lowercase "rallyroo" is the
 *     domain/slug form and is not reported.
 *
 * It tests what RENDERS, not the source spelling (RA-02): the cooked value of
 * string literals and template chunks (`"R\u0065llo"`), HTML entities in JSX
 * text and attributes (`R&#101;llo`), entities inside strings that read as
 * HTML (email bodies; there a numeric reference decodes without its
 * semicolon too, and text beside tags is text, not a path), and invisible
 * zero-width / soft-hyphen splitters. An uppercase env-style word
 * ("RELLO2_URL") is never the brand.
 *
 * Does NOT report (internal names stay "Rello"):
 *   - arguments of log calls: console.*, logger.* / log.* / *Logger.*.
 *     Error and throw messages DO report (KA ruling on RA-03, measured at 13
 *     in the hub): an Error message is often rendered (`{e.message}`, an API
 *     error body). A genuinely internal one takes an eslint-disable comment
 *     with a reason, or the `allow` option;
 *   - import/export sources, `import()`, `require()`, `vi.mock()`/`jest.mock()`;
 *   - object/class/interface keys, identifiers, comments, TS literal types;
 *   - the lowercase `rello` slug (outside rendered JSX), and a literal that is
 *     exactly `RELLO` (the routing identifier) outside JSX;
 *   - hostnames, URLs, email addresses and paths (domain-phase work);
 *   - header names (`X-Rello-…`) and env var names (`RELLO_…`);
 *   - comparison operands, `case` tests and search arguments
 *     (`includes`/`startsWith`/`replace`/…), which match the old name rather
 *     than show it;
 *   - SQL / style tagged templates;
 *   - non-visible attributes of lowercase DOM elements (className, id, key,
 *     href, src, data-*, …). On a Capitalized component only key, ref,
 *     className and data-* are exempt: any other prop may be displayed (RA-03);
 *   - tests, specs, mocks, fixtures and stories (by file name: *.test.*,
 *     *.pg-test.*, *.node-test.*, *.test-helper.*, *.testkit.*, *.spec.*,
 *     *.fixture(s).*, *.stories.*, __tests__/, __fixtures__/, __mocks__/),
 *     and files matching the `allow` globs.
 *
 * No autofix: the fix is an import plus an expression, and which field
 * (name / domain / supportEmail) is right is the author's call.
 *
 * KNOWN MISSES (documented, not lint's job; the rendered-text sweep at the
 * end of the rename catches them). Each was measured by RALLYROO AUDIT 1:
 *   - split JSX:            <h1>Rel{"lo"}</h1>
 *   - runtime concatenation: <h1>{"Rel" + "lo"}</h1>, "Rel".concat("lo")
 *   - a log-named object that writes the DOM:
 *       const log = { info: (t) => { el.textContent = t; } }; log.info("Rello");
 *   - a DOM write inside a console.* callback:
 *       console.log(items.map(() => { el.textContent = "Rello"; return 1; }));
 *   - a named HTML entity outside the decoder's short table, e.g. an invisible
 *     splitter: `<p>Rel&NegativeThinSpace;lo</p>` (RA-07 B, KA ruling: not
 *     fixed; the full HTML named-entity table is ~2,000 names). Numeric
 *     references always decode, in HTML with or without the semicolon.
 * Served JSON / Markdown / HTML files are outside any JS lint: run the
 * `brand-content-scan` CLI from this package for those (RA-04).
 */

const path = require("path");

const FIX_HINT = "use PLATFORM_BRAND.name from @rello-platform/slugs";

const { decode, decodeJsEscapes, looksLikeHtml, findBrandMatches, classify } = require("../brand-text");

const LOG_OBJECT_RE = /^(?:console|logger|log|[A-Za-z0-9_]*Logger)$/;
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

// On a Capitalized component any prop may be displayed; only these never are.
const COMPONENT_NON_VISIBLE_ATTRS = new Set(["key", "ref", "className"]);

/** Lowercase DOM element (`div`, `svg:use`), not a component (`Badge`, `Ui.Card`). */
function isIntrinsicElement(opening) {
  const n = opening && opening.name;
  if (!n) return false;
  if (n.type === "JSXNamespacedName") return true;
  return n.type === "JSXIdentifier" && /^[a-z]/.test(n.name);
}

/** True when this JSXAttribute's value is never shown to a person. */
function isNonVisibleAttr(attr) {
  const name = jsxAttrName(attr);
  if (!name) return false;
  if (name.startsWith("data-")) return true;
  return isIntrinsicElement(attr.parent) ? NON_VISIBLE_ATTRS.has(name) : COMPONENT_NON_VISIBLE_ATTRS.has(name);
}

/**
 * The JSX position a string node renders in, if any:
 *   "child"     — a JSX child expression ({"x"}, {ok ? "x" : y}, {a || "x"})
 *   "attribute" — a JSX attribute value (title="x", title={"x"})
 *   null        — not directly rendered by JSX
 */
function jsxPosition(node) {
  let child = node;
  let cur = node.parent;
  while (
    cur &&
    ((cur.type === "ConditionalExpression" && cur.test !== child) ||
      cur.type === "LogicalExpression" ||
      cur.type === "TSAsExpression" ||
      cur.type === "TSSatisfiesExpression" ||
      cur.type === "TSNonNullExpression")
  ) {
    child = cur;
    cur = cur.parent;
  }
  if (!cur) return null;
  if (cur.type === "JSXAttribute") return "attribute";
  if (cur.type === "JSXExpressionContainer") {
    const p = cur.parent;
    if (p && p.type === "JSXAttribute") return "attribute";
    if (p && (p.type === "JSXElement" || p.type === "JSXFragment")) return "child";
  }
  return null;
}

/**
 * True when a string-bearing node (Literal or TemplateLiteral) sits where its
 * text is not shown to a person: a key, a module specifier, a type, a
 * comparison, or the argument of a log call.
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
      case "CallExpression":
        if (cur.arguments.includes(child) && isLogCall(cur)) return true;
        if (cur.arguments[0] === child && isModuleSpecifierCall(cur)) return true;
        break;
      case "TaggedTemplateExpression":
        if (cur.quasi === child && EXEMPT_TAG_RE.test(tagName(cur.tag) || "")) return true;
        break;
      case "JSXAttribute":
        return isNonVisibleAttr(cur);
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
     * Report each brand match in `dec.text` (decoded, see brand-text.js).
     * `base` is the source index of dec's raw string, or null when the raw
     * source cannot be mapped character-for-character (a JS escape sequence
     * changed the length) — then the whole node is the location.
     *   anyCaseLegacy:  every casing of the legacy name counts (JSX children)
     *   routingValue:   the literal's full value, when the bare-RELLO routing
     *                   exemption applies (outside JSX only)
     */
    function scan(dec, base, node, { anyCaseLegacy = false, routingValue, html = false } = {}) {
      for (const hit of findBrandMatches(dec.text, { anyCaseLegacy, html })) {
        // A literal that is exactly "RELLO" is the routing identifier for the
        // `rello` slug (toSourceAppIdentifier), not prose — outside JSX only.
        if (hit.found === "RELLO" && typeof routingValue === "string" && routingValue.trim() === "RELLO") continue;
        const loc =
          base === null
            ? node.loc
            : {
                start: sourceCode.getLocFromIndex(base + dec.map[hit.start]),
                end: sourceCode.getLocFromIndex(base + dec.map[hit.end]),
              };
        context.report({ loc, messageId: hit.messageId, data: { found: hit.found } });
      }
    }

    /**
     * Decode a JS string's cooked `value` (plus HTML entities when it reads as
     * HTML), mapped back to the source through its escape sequences.
     * `rawInner` is the source between the delimiters, starting at `rawStart`.
     */
    function decodeJsString(value, rawInner, rawStart, html) {
      const dec = decode(value, { entities: html, html });
      const js = decodeJsEscapes(rawInner);
      if (js.text !== value) return { dec, base: null };
      return { dec: { text: dec.text, map: dec.map.map((i) => js.map[i]) }, base: rawStart };
    }

    return {
      JSXText(node) {
        // JSX text renders with HTML entities decoded and its case as typed.
        const raw = sourceCode.getText(node);
        scan(decode(raw, { entities: true }), node.range[0], node, { anyCaseLegacy: true });
      },

      Literal(node) {
        if (typeof node.value !== "string") return;
        const rawText = sourceCode.getText(node);
        if (node.parent && node.parent.type === "JSXAttribute") {
          if (isNonVisibleAttr(node.parent)) return;
          // A JSX attribute string has no JS escapes; entities decode.
          scan(decode(rawText.slice(1, -1), { entities: true }), node.range[0] + 1, node);
          return;
        }
        if (isExemptContext(node)) return;
        const pos = jsxPosition(node);
        const { dec, base } = decodeJsString(node.value, rawText.slice(1, -1), node.range[0] + 1, looksLikeHtml(node.value));
        scan(dec, base, node, {
          anyCaseLegacy: pos === "child",
          routingValue: pos === null ? node.value : undefined,
          html: looksLikeHtml(node.value),
        });
      },

      TemplateLiteral(node) {
        if (isExemptContext(node)) return;
        const pos = jsxPosition(node);
        const cooked = node.quasis.map((q) => (q.value.cooked == null ? q.value.raw : q.value.cooked));
        const html = looksLikeHtml(cooked.join(""));
        const single = node.quasis.length === 1 && pos === null ? cooked[0] : undefined;
        node.quasis.forEach((q, i) => {
          // A quasi's source is its raw text between a 1-char opener (` or })
          // and its closer (` or ${).
          const { dec, base } = decodeJsString(cooked[i], q.value.raw, q.range[0] + 1, html);
          scan(dec, base, q, { anyCaseLegacy: pos === "child", routingValue: single, html });
        });
      },
    };
  },
};

module.exports._internal = { classify, globToRegExp, isAllowlisted, isTestPath, isNonVisibleAttr, jsxPosition };
