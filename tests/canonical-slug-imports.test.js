"use strict";

const { RuleTester } = require("eslint");
const rule = require("../lib/rules/canonical-slug-imports");

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("canonical-slug-imports", rule, {
  valid: [
    // Single canonical slug literal — unaffected.
    { code: 'const x = "milo-engine";' },
    // Non-slug array.
    { code: 'const x = ["foo", "bar", "baz"];' },
    // One canonical slug + one non-slug — under threshold.
    { code: 'const x = ["milo-engine", "ineligible"];' },
    // Imported from canonical package.
    {
      code: 'import { ENGINE_SLUGS } from "@rello-platform/slugs"; const x = ENGINE_SLUGS;',
    },
    // Object with single value — unaffected.
    { code: 'const x = { engine: "milo-engine" };' },
  ],
  invalid: [
    {
      code: 'const ENGINE_SLUGS = ["milo-engine", "content-engine", "property-engine"];',
      errors: [{ messageId: "hardcodedSlugArray" }],
      output: "const ENGINE_SLUGS = ENGINE_SLUGS;",
    },
    {
      code: 'const APP_SLUGS = ["rello", "home-ready", "harvest-home"];',
      errors: [{ messageId: "hardcodedSlugArray" }],
      output: "const APP_SLUGS = APP_SLUGS;",
    },
    {
      code: 'const list = ["milo-engine", "content-engine"];',
      errors: [{ messageId: "hardcodedSlugArrayAnonymous" }],
    },
    {
      code: 'const PLATFORM_SLUGS = ["rello", "milo-engine"];',
      errors: [{ messageId: "hardcodedSlugArray" }],
      output: "const PLATFORM_SLUGS = PLATFORM_SLUGS;",
    },
  ],
});
