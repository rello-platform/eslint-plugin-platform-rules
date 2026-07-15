"use strict";

const noEmptyCatches = require("./lib/rules/no-empty-catches");
const canonicalSlugImports = require("./lib/rules/canonical-slug-imports");
const noProcessEnvSecretCompare = require("./lib/rules/no-process-env-secret-compare");
const noEnvVarBearerFallback = require("./lib/rules/no-env-var-bearer-fallback");
const noInlineTabArrays = require("./lib/rules/no-inline-tab-arrays");
const noRedeclaredApiResponseTypes = require("./lib/rules/no-redeclared-api-response-types");
const noFixtureDataWhenUpstreamUnshipped = require("./lib/rules/no-fixture-data-when-upstream-unshipped");
const leadNotContact = require("./lib/rules/lead-not-contact");
const noModuleEvalCrossAppClients = require("./lib/rules/no-module-eval-cross-app-clients");
const requireTenantidInWhere = require("./lib/rules/require-tenantid-in-where");
const noDbInLiveness = require("./lib/rules/no-db-in-liveness");
const noNetworkWriteOnClientInterval = require("./lib/rules/no-network-write-on-client-interval");

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
    "no-module-eval-cross-app-clients": noModuleEvalCrossAppClients,
    "require-tenantid-in-where": requireTenantidInWhere,
    "no-db-in-liveness": noDbInLiveness,
    "no-network-write-on-client-interval": noNetworkWriteOnClientInterval,
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
    "@rello-platform/platform-rules/no-module-eval-cross-app-clients": "error",
    // Layer 1 of the 3-layer tenantId structural enforcement (DECISION-WALK
    // item A). Ships at `warn` — it CANNOT arm to `error` until every AST-FAIL
    // site is tenantId-filtered or marker-exempt; building the rule IS the
    // forcing function that drives the remaining tenantId waves to green.
    "@rello-platform/platform-rules/require-tenantid-in-where": "warn",
    // Ships at `error`: all 7 ecosystem liveness routes (**/health/route.ts) are
    // DB-free as of the 2026-06-04 NEON-AUTOSUSPEND sweep, so the rule is green
    // fleet-wide on adoption. The deep /api/health/ready route is not matched.
    "@rello-platform/platform-rules/no-db-in-liveness": "error",
    // Ships at `warn`: a HEURISTIC — it cannot statically prove a given client
    // poller pauses on hidden/idle, so it points the reviewer at every
    // client-interval network call (fetch/sendBeacon) to confirm the
    // DISPATCH-31 guard. The one known live offender (THS useEngagementTracking)
    // is fixed in the same dispatch; LabDebugPanel is a prod-gated lab tool.
    "@rello-platform/platform-rules/no-network-write-on-client-interval": "warn",
  },
};

module.exports = plugin;
module.exports.default = plugin;
