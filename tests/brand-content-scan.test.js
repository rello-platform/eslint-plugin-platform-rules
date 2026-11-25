"use strict";

// RALLYROO RA-04: served JSON / Markdown / HTML never passes through ESLint, so
// bin/brand-content-scan.js scans it with the rule's own matcher.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { expandBraces, staticBase, scanLine } = require("../bin/brand-content-scan");

const CLI = path.join(__dirname, "..", "bin", "brand-content-scan.js");

function makeRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "brand-scan-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

function run(root, args = []) {
  const r = spawnSync(process.execPath, [CLI, "--root", root, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe("brand-content-scan: matcher per line", () => {
  it("reports the whole word, a compound, an entity and a JSON escape", () => {
    assert.equal(scanLine("# Rello", "public/a.md").length, 1);
    assert.equal(scanLine("Try RelloCRM today", "public/a.md").length, 1);
    assert.equal(scanLine("<h1>R&#101;llo</h1>", "public/a.html").length, 1);
    assert.equal(scanLine('{"heading":"R\\u0065llo"}', "public/a.json").length, 1);
    assert.equal(scanLine("RELLO PLATFORM", "public/a.txt").length, 1);
  });
  it("stays silent on the slug, hosts, env names and other words", () => {
    for (const line of [
      '{"slug":"rello"}',
      "See https://hellorello.app/pricing",
      "Write to support@hellorello.app",
      "RELLO_API_URL=",
      "Morello, Prello, Relloc",
      "Welcome to Rallyroo",
    ]) {
      assert.deepEqual(scanLine(line, "public/a.md"), [], line);
    }
  });
  it("expands braces and finds where to walk", () => {
    assert.deepEqual(expandBraces("public/**/*.{json,md}"), ["public/**/*.json", "public/**/*.md"]);
    assert.deepEqual(expandBraces("a/{x,y}/*.{md,txt}"), ["a/x/*.md", "a/x/*.txt", "a/y/*.md", "a/y/*.txt"]);
    assert.equal(staticBase("public/**/*.json"), "public");
    assert.equal(staticBase("src/app/copy.json"), "src/app");
    assert.equal(staticBase("**/*.md"), "");
  });
});

describe("brand-content-scan: CLI", () => {
  let root;
  before(() => {
    root = makeRepo({
      "public/copy.json": '{\n  "heading": "Rello"\n}\n',
      "public/copy.md": "intro\n# Rello\n",
      "public/legal/terms.html": "<p>The R&#101;llo team</p>\n",
      "public/site.webmanifest": '{"name":"R\\u0065llo CRM","short_name":"rello"}\n',
      "public/clean.md": "Welcome to Rallyroo. Visit https://hellorello.app. slug: rello\n",
      "public/app.js": 'const s = "Rello";\n', // not a content file: lint's job
      "public/node_modules/pkg/readme.md": "# Rello\n",
      "src/content/faq.mdx": "Why RelloHub?\n",
      "src/content/data.ts": 'export const s = "Rello";\n',
      "README.md": "# Rello (internal repo name)\n", // outside the default globs
    });
  });
  after(() => fs.rmSync(root, { recursive: true, force: true }));

  it("prints file:line for every hit in the default globs and exits 1", () => {
    const r = run(root);
    assert.equal(r.code, 1, r.err);
    const lines = r.out.trim().split("\n");
    const hits = lines.filter((l) => !l.startsWith("brand-content-scan:")).map((l) => l.split(": ")[0]);
    assert.deepEqual(hits.sort(), [
      "public/copy.json:2",
      "public/copy.md:2",
      "public/legal/terms.html:1",
      "public/site.webmanifest:1",
      "src/content/faq.mdx:1",
    ]);
    assert.match(lines.at(-1), /5 hit\(s\) in 5 file\(s\) · scanned 6 file\(s\)/);
  });

  it("skips files named in the allow file and counts them", () => {
    fs.writeFileSync(path.join(root, ".brand-scan-allow"), "# legal copy is counsel's\npublic/legal/**\n\npublic/copy.*\n");
    try {
      const r = run(root);
      assert.equal(r.code, 1);
      assert.match(r.out, /2 hit\(s\) in 2 file\(s\) · scanned 3 file\(s\) · 3 allowed/);
      assert.doesNotMatch(r.out, /public\/legal\/terms\.html:1/);
    } finally {
      fs.rmSync(path.join(root, ".brand-scan-allow"));
    }
  });

  it("takes an explicit --allow file and explicit globs", () => {
    const allow = path.join(root, "my-allow.txt");
    fs.writeFileSync(allow, "public/copy.md\n");
    try {
      const r = run(root, ["--allow", allow, "public/*.md"]);
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /0 hit\(s\) in 0 file\(s\) · scanned 1 file\(s\) · 1 allowed/);
    } finally {
      fs.rmSync(allow);
    }
  });

  it("exits 0 and says so when nothing matches (no public/ at all)", () => {
    const empty = makeRepo({ "src/index.ts": 'export const s = "Rello";\n' });
    try {
      const r = run(empty);
      assert.equal(r.code, 0);
      assert.match(r.out, /0 hit\(s\) in 0 file\(s\) · scanned 0 file\(s\)/);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it("exits 2 on an unreadable file — never reports it clean", { skip: process.getuid && process.getuid() === 0 }, () => {
    const repo = makeRepo({ "public/locked.md": "# Rello\n" });
    const locked = path.join(repo, "public/locked.md");
    fs.chmodSync(locked, 0o000);
    try {
      const r = run(repo);
      assert.equal(r.code, 2);
      assert.match(r.err, /UNREADABLE public\/locked\.md/);
      assert.match(r.out, /1 UNREADABLE/);
    } finally {
      fs.chmodSync(locked, 0o644);
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it("exits 2 on a missing allow file or a bad option", () => {
    assert.equal(run(root, ["--allow", path.join(root, "nope.txt")]).code, 2);
    assert.equal(run(root, ["--bogus"]).code, 2);
  });
});
