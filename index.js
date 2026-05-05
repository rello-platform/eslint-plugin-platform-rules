"use strict";

const noEmptyCatches = require("./lib/rules/no-empty-catches");
const canonicalSlugImports = require("./lib/rules/canonical-slug-imports");
const noProcessEnvSecretCompare = require("./lib/rules/no-process-env-secret-compare");
const noEnvVarBearerFallback = require("./lib/rules/no-env-var-bearer-fallback");
const noInlineTabArrays = require("./lib/rules/no-inline-tab-arrays");
const noRedeclaredApiResponseTypes = require("./lib/rules/no-redeclared-api-response-types");
const noFixtureDataWhenUpstreamUnshipped = require("./lib/rules/no-fixture-data-when-upstream-unshipped");
const leadNotContact = require("./lib/rules/lead-not-contact");

const plugin = {
  meta: {
    name: "@rello-platform/eslint-plugin-platform-rules",
    version: require("./package.json").version,
  },
  rules: {
    "no-empty-catches": noEmptyCatches,
    "canonical-slug-imports": canonicalSlugImports,
    "no-process-env-secret-compare": noProcessEnvSecretCompare,
    "no-env-var-bearer-fallback": noEnvVarBearerFallback,
    "no-inline-tab-arrays": noInlineTabArrays,
    "no-redeclared-api-response-types": noRedeclaredApiResponseTypes,
    "no-fixture-data-when-upstream-unshipped": noFixtureDataWhenUpstreamUnshipped,
    "lead-not-contact": leadNotContact,
  },
  configs: {},
};

plugin.configs.recommended = {
  plugins: { "@rello-platform/platform-rules": plugin },
  rules: {
    "@rello-platform/platform-rules/no-empty-catches": "error",
    "@rello-platform/platform-rules/canonical-slug-imports": "error",
    "@rello-platform/platform-rules/no-process-env-secret-compare": "error",
    "@rello-platform/platform-rules/no-env-var-bearer-fallback": "error",
    "@rello-platform/platform-rules/no-inline-tab-arrays": "warn",
    "@rello-platform/platform-rules/no-redeclared-api-response-types": "warn",
    "@rello-platform/platform-rules/no-fixture-data-when-upstream-unshipped": "warn",
    "@rello-platform/platform-rules/lead-not-contact": "warn",
  },
};

module.exports = plugin;
module.exports.default = plugin;
