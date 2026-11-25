#!/usr/bin/env node
"use strict";

/**
 * brand-content-scan — the second brand guard (RALLYROO RA-04).
 *
 * The lint rule `no-legacy-brand-in-visible-text` sees JS/TS only. Copy that a
 * site serves straight from files (public/*.json, *.md, *.html, the web
 * manifest) never passes through ESLint, so a clean lint is not a clean site.
 * This scans those files with the SAME matcher as the rule (lib/brand-text.js:
 * whole word or compound, HTML entities and JSON \u escapes decoded) and
 * prints file:line for every legacy name.
 *
 * Usage:
 *   brand-content-scan [--root <dir>] [--allow <file>] [glob ...]
 *
 * Default globs (relative to --root, default the current directory):
 *   public/**\/*.{json,md,mdx,txt,html,webmanifest}
 *   src/**\/*.{json,md,mdx}
 * Allow file: --allow <file>, else <root>/.brand-scan-allow when present. One
 * file glob per line (relative to root); blank lines and # comments ignored.
 * A matching file is skipped whole and counted as "allowed" in the summary.
 *
 * Exit codes: 0 no hits · 1 one or more hits · 2 a file could not be read or
 * the arguments were wrong. An unreadable file is never reported as clean.
 * No dependencies beyond Node itself.
 */

const fs = require("fs");
const path = require("path");
const { decode, decodeJsEscapes, findBrandMatches } = require("../lib/brand-text");
const { globToRegExp } = require("../lib/rules/no-legacy-brand-in-visible-text")._internal;

const DEFAULT_GLOBS = ["public/**/*.{json,md,mdx,txt,html,webmanifest}", "src/**/*.{json,md,mdx}"];
const DEFAULT_ALLOW_FILE = ".brand-scan-allow";
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".turbo", ".vercel", "coverage"]);
const JSON_EXT_RE = /\.(?:json|webmanifest)$/i;

function usage(code, msg) {
  if (msg) process.stderr.write(`brand-content-scan: ${msg}\n`);
  process.stderr.write(
    "usage: brand-content-scan [--root <dir>] [--allow <file>] [glob ...]\n" +
      `default globs: ${DEFAULT_GLOBS.join("  ")}\n` +
      `allow file: --allow <file>, else <root>/${DEFAULT_ALLOW_FILE} if present (one file glob per line)\n` +
      "exit: 0 clean · 1 hits · 2 unreadable file or bad arguments\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { root: process.cwd(), allowFile: null, globs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") usage(0);
    else if (a === "--root" || a === "--allow") {
      const v = argv[++i];
      if (!v) usage(2, `${a} needs a value`);
      if (a === "--root") out.root = path.resolve(v);
      else out.allowFile = path.resolve(v);
    } else if (a.startsWith("--")) usage(2, `unknown option ${a}`);
    else out.globs.push(a);
  }
  if (out.globs.length === 0) out.globs = DEFAULT_GLOBS.slice();
  return out;
}

/** "a/{x,y}/*.{md,json}" → every brace alternative, recursively. */
function expandBraces(glob) {
  const open = glob.indexOf("{");
  if (open === -1) return [glob];
  let depth = 0;
  for (let i = open; i < glob.length; i++) {
    if (glob[i] === "{") depth++;
    else if (glob[i] === "}" && --depth === 0) {
      const parts = [];
      let start = open + 1;
      let d = 0;
      for (let j = open + 1; j < i; j++) {
        if (glob[j] === "{") d++;
        else if (glob[j] === "}") d--;
        else if (glob[j] === "," && d === 0) {
          parts.push(glob.slice(start, j));
          start = j + 1;
        }
      }
      parts.push(glob.slice(start, i));
      const head = glob.slice(0, open);
      const tail = glob.slice(i + 1);
      return parts.flatMap((p) => expandBraces(head + p + tail));
    }
  }
  return [glob]; // unbalanced: treat literally
}

/** Directory part of a glob before its first wildcard: where walking starts. */
function staticBase(glob) {
  const segs = glob.split("/");
  const base = [];
  for (const s of segs) {
    if (/[*?[{]/.test(s)) break;
    base.push(s);
  }
  // A glob with no wildcard names a file: its base is its directory.
  if (base.length === segs.length) base.pop();
  return base.join("/");
}

function walk(absDir, onFile, onError) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT" || err.code === "ENOTDIR") return; // nothing there: not a failure
    onError(absDir, err);
    return;
  }
  for (const e of entries) {
    const abs = path.join(absDir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(abs, onFile, onError);
    } else if (e.isFile()) {
      onFile(abs);
    }
  }
}

function readAllowGlobs(file) {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.replace(/^\.\//, ""));
}

/** Legacy-name hits on one line of `relPath`, decoded as the file type renders. */
function scanLine(line, relPath) {
  let text = line;
  if (JSON_EXT_RE.test(relPath)) text = decodeJsEscapes(text).text;
  text = decode(text, { entities: true }).text;
  return findBrandMatches(text).filter((h) => h.messageId === "legacyBrand");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.root;
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) usage(2, `root is not a directory: ${root}`);

  let allowGlobs = [];
  const allowFile = args.allowFile || path.join(root, DEFAULT_ALLOW_FILE);
  if (args.allowFile || fs.existsSync(allowFile)) {
    try {
      allowGlobs = readAllowGlobs(allowFile);
    } catch (err) {
      usage(2, `cannot read allow file ${allowFile}: ${err.message}`);
    }
  }
  const allowRes = allowGlobs.map(globToRegExp);

  const patterns = args.globs.flatMap(expandBraces).map((g) => g.replace(/^\.\//, ""));
  const matchers = patterns.map((g) => ({ re: globToRegExp(g), base: staticBase(g) }));
  const files = new Set();
  const unreadable = [];
  for (const base of new Set(matchers.map((m) => m.base))) {
    const absBase = path.join(root, base);
    let st;
    try {
      st = fs.statSync(absBase);
    } catch {
      continue; // e.g. no public/ in this repo
    }
    const consider = (abs) => {
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (matchers.some((m) => m.re.test(rel))) files.add(rel);
    };
    if (st.isFile()) consider(absBase);
    else walk(absBase, consider, (dir, err) => unreadable.push(`${path.relative(root, dir) || "."}: ${err.message}`));
  }

  let hits = 0;
  let allowed = 0;
  const hitFiles = new Set();
  const sorted = [...files].sort();
  for (const rel of sorted) {
    if (allowRes.some((re) => re.test(rel))) {
      allowed++;
      continue;
    }
    let content;
    try {
      content = fs.readFileSync(path.join(root, rel), "utf8");
    } catch (err) {
      unreadable.push(`${rel}: ${err.message}`);
      continue;
    }
    const lines = content.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const h of scanLine(line, rel)) {
        hits++;
        hitFiles.add(rel);
        process.stdout.write(`${rel}:${i + 1}: "${h.found}" — ${line.trim().slice(0, 160)}\n`);
      }
    });
  }

  for (const u of unreadable) process.stderr.write(`brand-content-scan: UNREADABLE ${u}\n`);
  process.stdout.write(
    `brand-content-scan: ${hits} hit(s) in ${hitFiles.size} file(s) · scanned ${sorted.length - allowed} file(s)` +
      (allowed ? ` · ${allowed} allowed` : "") +
      (unreadable.length ? ` · ${unreadable.length} UNREADABLE` : "") +
      ` · globs: ${args.globs.join(" ")}\n`,
  );
  if (unreadable.length) process.exit(2);
  process.exit(hits > 0 ? 1 : 0);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`brand-content-scan: failed: ${err && err.stack ? err.stack : err}\n`);
    process.exit(2);
  }
}

module.exports = { expandBraces, staticBase, scanLine };
