"use strict";

/**
 * @fileoverview The brand matcher shared by the `no-legacy-brand-in-visible-text`
 * rule and the `brand-content-scan` CLI, so both see the same thing.
 *
 *   decode(raw, { entities })   → { text, map }   what a person sees, with a
 *                                                   map back to raw indexes
 *   findBrandMatches(text, opts) → matches         brand names in that text
 *
 * Decoding (RA-02): HTML character references (`R&#101;llo`, `&amp;`) and the
 * invisible characters that split a word without showing (zero-width space /
 * joiners, word joiner, BOM, soft hyphen) are resolved before matching, so a
 * name that RENDERS as the brand is seen as the brand.
 *
 * Matching: a whole word, or a compound — the brand followed by an uppercase
 * letter or a digit ("RelloCRM", "Rello2"; RA-02). An underscore or a lowercase
 * letter after it is part of a different word ("RELLO_API_URL", "Relloc").
 * An all-caps match followed by another capital ("RELLOAPI") is one all-caps
 * word, not a camel-case compound, and is left alone.
 */

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  ensp: "\u2002",
  emsp: "\u2003",
  thinsp: "\u2009",
  shy: "\u00ad",
  zwsp: "\u200b",
  zwnj: "\u200c",
  zwj: "\u200d",
  NoBreak: "\u2060",
  ZeroWidthSpace: "\u200b",
  hyphen: "\u2010",
  dash: "\u2010",
  ndash: "\u2013",
  mdash: "\u2014",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
  hellip: "\u2026",
  middot: "\u00b7",
  bull: "\u2022",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
};

const ENTITY_RE = /&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/y;
// HTML (not JSX) also renders a numeric reference with no semicolon: the
// digits are read greedily, so "R&#101llo" and "R&#x65llo" both show "Rello"
// (RA-07 A). JSX leaves such text literal, so JSX callers stay strict.
const NUMERIC_NO_SEMI_RE = /&(#[0-9]+|#[xX][0-9a-fA-F]+)/y;
const INVISIBLE_RE = /[\u00ad\u200b-\u200d\u2060\ufeff]/;

function decodeEntity(body) {
  if (body[0] === "#") {
    const hex = body[1] === "x" || body[1] === "X";
    const cp = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return null;
    return String.fromCodePoint(cp);
  }
  return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : null;
}

/**
 * Resolve what a person sees. `map[i]` is the index in `raw` where decoded
 * character `i` came from; `map[text.length] === raw.length`.
 * `entities`: decode HTML character references (JSX rules: semicolon required).
 * `html`: the text is HTML, so numeric references without a semicolon decode too.
 * @param {string} raw
 * @param {{ entities?: boolean, html?: boolean }} [opts]
 */
function decode(raw, opts) {
  const entities = Boolean(opts && opts.entities);
  const html = Boolean(opts && opts.html);
  let text = "";
  const map = [];
  let i = 0;
  while (i < raw.length) {
    if (entities && raw[i] === "&") {
      ENTITY_RE.lastIndex = i;
      let m = ENTITY_RE.exec(raw);
      if (!m && html) {
        NUMERIC_NO_SEMI_RE.lastIndex = i;
        m = NUMERIC_NO_SEMI_RE.exec(raw);
      }
      const ch = m ? decodeEntity(m[1]) : null;
      if (ch !== null) {
        if (!INVISIBLE_RE.test(ch)) {
          for (let k = 0; k < ch.length; k++) map.push(i);
          text += ch;
        }
        i += m[0].length;
        continue;
      }
    }
    if (!INVISIBLE_RE.test(raw[i])) {
      map.push(i);
      text += raw[i];
    }
    i++;
  }
  map.push(raw.length);
  return { text, map };
}

const SIMPLE_ESCAPES = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v" };

/**
 * Decode the escape sequences in a JS string's source (between its quotes or
 * backticks) with a map back to source indexes, so a match in the cooked
 * value can be located exactly. The caller compares `text` to the parser's
 * cooked value and falls back to the whole node when they differ (legacy
 * octal escapes, which this does not decode).
 * @param {string} raw
 */
function decodeJsEscapes(raw) {
  let text = "";
  const map = [];
  const push = (s, at) => {
    for (let k = 0; k < s.length; k++) map.push(at);
    text += s;
  };
  let i = 0;
  while (i < raw.length) {
    if (raw[i] !== "\\" || i + 1 >= raw.length) {
      push(raw[i], i);
      i++;
      continue;
    }
    const c = raw[i + 1];
    let m;
    if (c === "\r" && raw[i + 2] === "\n") {
      i += 3; // line continuation
    } else if (c === "\n" || c === "\r" || c === "\u2028" || c === "\u2029") {
      i += 2;
    } else if (Object.prototype.hasOwnProperty.call(SIMPLE_ESCAPES, c)) {
      push(SIMPLE_ESCAPES[c], i);
      i += 2;
    } else if (c === "0" && !/[0-9]/.test(raw[i + 2] || "")) {
      push("\0", i);
      i += 2;
    } else if (c === "x" && (m = /^[0-9a-fA-F]{2}/.exec(raw.slice(i + 2, i + 4)))) {
      push(String.fromCharCode(parseInt(m[0], 16)), i);
      i += 4;
    } else if (c === "u" && (m = /^\{([0-9a-fA-F]{1,6})\}/.exec(raw.slice(i + 2, i + 10)))) {
      const cp = parseInt(m[1], 16);
      push(cp <= 0x10ffff ? String.fromCodePoint(cp) : "", i);
      i += 2 + m[0].length;
    } else if (c === "u" && (m = /^[0-9a-fA-F]{4}/.exec(raw.slice(i + 2, i + 6)))) {
      push(String.fromCharCode(parseInt(m[0], 16)), i);
      i += 6;
    } else {
      push(c, i); // \' \" \\ \` \$ and identity escapes
      i += 2;
    }
  }
  map.push(raw.length);
  return { text, map };
}

/** True when a string reads as HTML markup (an email body, a snippet): entities in it render. */
function looksLikeHtml(s) {
  return typeof s === "string" && /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/.test(s);
}

// Every spelling is SEEN; classify() decides. What may follow is checked
// case-sensitively in findBrandMatches (the `i` flag would blind a lookahead).
const BRAND_RE = /(?<![A-Za-z0-9_])(?:rello|rallyroo)/gi;

/**
 * "legacyBrand" | "handTypedBrand" | null.
 * `anyCaseLegacy`: every casing of the legacy name counts (rendered JSX text).
 */
function classify(found, anyCaseLegacy) {
  if (found.length === 5) {
    if (found === "Rello" || found === "RELLO") return "legacyBrand";
    return anyCaseLegacy ? "legacyBrand" : null;
  }
  if (found.length === 8 && found !== "rallyroo") return "handTypedBrand";
  return null;
}

// Tokens (whitespace-delimited runs) that are addresses, not prose.
const URL_RE = /:\/\//;
const HOSTNAME_RE = /[A-Za-z0-9-]\.[A-Za-z]{2,}/;
const HEADER_NAME_RE = /^x-[a-z0-9]+(?:-[a-z0-9]+)+$/i;
const PATH_START_RE = /^(?:\/|\.\.?\/|@)/;
const TOKEN_TRIM_RE = /^[("'`<[{]+|[)"'`>\]},;:!?]+$/g;

const TEXT_BOUNDARY_RE = /\s/;
// In HTML, markup and attribute quotes also end a token: in
// `</p><p>Rello</p>` the word is text beside tags, not a path (RA-06), and in
// `href="/welcome/Rello"` the token is the path itself.
const HTML_BOUNDARY_RE = /[\s<>"']/;

/**
 * The token around [start, end) in `text`, edge punctuation trimmed: a
 * whitespace-delimited run, or in HTML a run also ended by `<`, `>` and quotes.
 */
function tokenAround(text, start, end, html) {
  const boundary = html ? HTML_BOUNDARY_RE : TEXT_BOUNDARY_RE;
  let s = start;
  let e = end;
  while (s > 0 && !boundary.test(text[s - 1])) s--;
  while (e < text.length && !boundary.test(text[e])) e++;
  return text.slice(s, e).replace(TOKEN_TRIM_RE, "");
}

/** The [A-Za-z0-9_] run around [start, end): an env-style name when it is `[A-Z0-9_]+` with an underscore. */
function isEnvStyleWord(text, start, end) {
  let s = start;
  let e = end;
  while (s > 0 && /[A-Za-z0-9_]/.test(text[s - 1])) s--;
  while (e < text.length && /[A-Za-z0-9_]/.test(text[e])) e++;
  const word = text.slice(s, e);
  return /^[A-Z0-9_]+$/.test(word) && word.includes("_");
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

/**
 * Brand names in `text` (already decoded). Address tokens (URLs, hosts,
 * emails, paths, X-… headers) are skipped: the domain phase owns them.
 * `html`: the text is HTML markup; tokens also end at tags and quotes.
 * @param {string} text
 * @param {{ anyCaseLegacy?: boolean, html?: boolean }} [opts]
 * @returns {{ found: string, start: number, end: number, messageId: string }[]}
 */
function findBrandMatches(text, opts) {
  const anyCaseLegacy = Boolean(opts && opts.anyCaseLegacy);
  const html = Boolean(opts && opts.html);
  const out = [];
  BRAND_RE.lastIndex = 0;
  let m;
  while ((m = BRAND_RE.exec(text)) !== null) {
    const found = m[0];
    const start = m.index;
    const end = start + found.length;
    const next = text[end];
    if (next !== undefined) {
      // "Relloc", "RELLO_API_URL": part of a different word.
      if (/[a-z_]/.test(next)) continue;
      // "RELLOAPI": an all-caps run, not a camel-case compound.
      if (/[A-Z]/.test(next) && found === found.toUpperCase()) continue;
    }
    // "RELLO2_URL": an env-style name is internal even when a digit follows (RA-08).
    if (isEnvStyleWord(text, start, end)) continue;
    const messageId = classify(found, anyCaseLegacy);
    if (!messageId) continue;
    if (isAddressToken(tokenAround(text, start, end, html))) continue;
    out.push({ found, start, end, messageId });
  }
  return out;
}

module.exports = { decode, decodeJsEscapes, looksLikeHtml, findBrandMatches, classify, isAddressToken, tokenAround };
