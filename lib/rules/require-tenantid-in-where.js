"use strict";

/**
 * @fileoverview Flags Prisma queries on tenant-scoped models whose `where`
 * clause does not filter by `tenantId` (at any depth, including nested
 * relation predicates). Realizes the universal-floor invariant: "Every
 * database query must filter by `tenantId`" (~/.claude/CLAUDE.md § Security
 * & tenant isolation).
 *
 * Realizes: PLATFORM-CLASS-LEVEL-RULES.md tenant-isolation invariant.
 * Codified per DECISION-WALK-LOCKED-ANSWERS-2026-06-01 item A (Layer 1 of the
 * 3-layer structural enforcement: lint → Prisma $extends guard → Postgres RLS).
 * Reference matcher: RECON-RELLO-TENANTID-AST-DELTA-AUDIT-FINDINGS-2026-05-18.md
 * (ts-morph matcher that surfaced 868 FAIL sites at Rello@0831cb98).
 *
 * Whitelist / suppression: the `EXEMPT-UPSTREAM-VERIFIED` inline marker
 * established by the tenantId Wave 1.5 (PR #39). A query is suppressed when a
 * `// tenant-isolation: EXEMPT-UPSTREAM-VERIFIED — <trace>` comment appears
 * EITHER on/adjacent to the call site (per-site marker) OR anywhere lexically
 * above it within the same enclosing function/transaction block (block-level
 * marker — covers tight cascade-delete clusters per the Wave 1.5/2 convention).
 *
 * SEVERITY: ships at `warn`. It CANNOT arm to `error` until every AST-FAIL
 * site is either tenantId-filtered or marker-exempt — building the rule IS the
 * forcing function that drives the remaining tenantId waves to green. The flip
 * to `error` is a later phase (consistent with no-process-env-secret-compare).
 *
 * NOTE: this rule errs toward flagging. Relation-FK-scoped sites that the AST
 * recon classified EXEMPT-SCOPED-BY-OTHER (e.g. `where: { leadId }` on a child
 * whose parent is tenant-verified upstream) are flagged here too — they are
 * resolved by adding the EXEMPT-UPSTREAM-VERIFIED marker with the upstream
 * trace as the waves work each file, exactly as Waves 1.5/2/3 already did.
 */

// Prisma model accessors that carry a `tenantId` column (derived from
// Rello prisma/schema.prisma: 209 of 321 models). Accessor = model name with
// a lowercased first letter (`ClosingTransaction` → `closingTransaction`).
const TENANT_SCOPED_MODELS = new Set([
  "abuseAlert", "abuseDetectionRule", "activity", "adverseEvent", "agent",
  "agentAvailability", "agentBillingCharge", "agentCapProgress", "agentGuardrail",
  "agentMutationDLQ", "agentNotificationPreference", "agentOutcome", "agentProfile",
  "agentStats", "agentSubscription", "agentTodayCard", "alertEvent", "apiKey",
  "appData", "appReport", "appScore", "appSignal", "audioJob", "auditLog",
  "autoTagRule", "billingIdempotencyKey", "billingWebhookDelivery", "billingWebhookDLQ",
  "bookingLink", "broadcastDelivery", "brokerReview", "calendarLayerPreference",
  "call", "callRetry", "callSession", "campaign", "campaignEnrollment",
  "clientPortalSession", "closingNote", "closingTransaction", "commissionFee",
  "commissionLedgerEntry", "commissionPlan", "commissionPlanTier", "communicationConsent",
  "communicationLog", "communicationTemplate", "complianceFlag", "compositionValidationEvent",
  "compoundPattern", "connectedCalendar", "connectedEmail", "connectedVideoProvider",
  "consentAuditLog", "contextCache", "contextCorrection", "conversionScore",
  "conversionScoreHistory", "costLog", "ctaInjection", "dailyDigest", "dailyPlan",
  "dashboardWorkspace", "dataExportRequest", "decisionExplanation", "decisionMemory",
  "document", "docusignConnection", "docusignEnvelope", "driftBaseline", "equitySnapshot",
  "errorLog", "escalationPolicy", "event", "eventEmitDLQ", "eventLog", "failedHHIntake",
  "failedInboundSignal", "failedMiloOutcome", "failedNurtureSend", "failedProfileSync",
  "failedRevocationPush", "failedSpokeOp", "formTemplate", "frameworkExplorationLog",
  "guestMLO", "harvestHomeScoringConfig", "importJob", "inboundRoute", "inboundWebhookLog",
  "invoice", "journey", "journeyDefinition", "journeyPattern", "labEvent", "lead",
  "leadContentHistory", "leadEmail", "leadExport", "leadFieldDefinition", "leadGeocodeDLQ",
  "leadImport", "leadPhaseState", "leadPhone", "leadPool", "leadProfile", "leadPurchaseBatch",
  "leadRateProfile", "leadSharingNotificationTemplate", "leadSyncDeadLetter", "learningOutcome",
  "learningRecord", "loanProgram", "localConversion", "marketBeatSnapshot", "meeting",
  "meetingSignalReceived", "messageEvent", "messageTrackingToken", "miloBriefingCache",
  "miloInsight", "miloLearningRejectionCounter", "miloProfile", "miloVaultFailureCounter",
  "mloPartner", "mRRSnapshot", "networkScore", "note", "notification", "notificationRetryQueue",
  "nurtureEnrollmentAuditLog", "nurtureLabSession", "nurturePrecedenceDecision",
  "nurtureSequence", "nurtureTemplate", "offlineInteraction", "operationalSignal",
  "outboundApiKey", "outcomeIdempotencyRecord", "pEDeleteCascadeFailure", "pipeline",
  "pipelineEvent", "platformMetricSnapshot", "productionRecord", "promptHealthAlert",
  "provisioningDeadletterEscalation", "provisioningReconciliation", "pushSubscription",
  "rateAlert", "rateLimitLog", "realtorProspect", "referralEdge", "referralPartner",
  "refiTargetLead", "replyDraft", "reportSnapshot", "requiredDocumentChecklist",
  "resourceUsage", "resourceUsageSnapshot", "routingLog", "routingRule", "savedView",
  "scheduledAction", "scoringAnomaly", "scoringGuideline", "segment", "segmentSnapshot",
  "senderReputation", "sequenceEffectiveness", "signalLog", "signalLogArchive", "signalRule",
  "signalSummary", "supportTicket", "suppressionEntry", "suppressionLift", "tag", "task",
  "team", "teamPool", "tenantAddOn", "tenantApp", "tenantBranding", "tenantBudgetConfig",
  "tenantBudgetUsage", "tenantClosingConfig", "tenantEmailOverride", "tenantEntitlement",
  "tenantGuardrail", "tenantInvite", "tenantMiloConfig", "tenantMiloProfile",
  "tenantRateAssumptionOverride", "tenantStats", "thread", "threadParticipant", "transaction",
  "transactionDocument", "unmatchedEmail", "usageRecord", "usageReportDLQ", "user",
  "userInAppNotificationRouting", "voicemailDrop", "voicemailTemplate", "webhookEndpoint",
  "wireFraudWarning", "wizardAnswer", "wizardQuestion",
]);

// Prisma query operations that accept a `where` clause (mirrors the AST recon's
// target-ops set). `create`/`createMany` excluded — no `where`.
const WHERE_BEARING_OPS = new Set([
  "findMany", "findFirst", "findUnique", "findFirstOrThrow", "findUniqueOrThrow",
  "count", "update", "updateMany", "delete", "deleteMany", "upsert", "aggregate",
  "groupBy",
]);

// Root identifier of a Prisma client / transaction client (mirrors the recon's
// looksLikePrismaIdent heuristic): `prisma`, `db`, `client`, `tx`, `trx`, `txn`,
// `t`, or any `prisma`-prefixed identifier (e.g. `prismaClient`).
const PRISMA_ROOT_RE = /^(prisma|db|client|tx|trx|txn|t)$/i;
function looksLikePrismaRoot(name) {
  if (typeof name !== "string") return false;
  if (PRISMA_ROOT_RE.test(name)) return true;
  return /^prisma[A-Z0-9]?/.test(name);
}

// The canonical EXEMPT-UPSTREAM-VERIFIED marker token (Wave 1.5 convention).
const MARKER_RE = /EXEMPT-UPSTREAM-VERIFIED/;

/**
 * Resolve the `<root>.<model>.<op>(...)` shape from a CallExpression.
 * Returns { root, model, op } or null.
 */
function describePrismaCall(node) {
  // node is a CallExpression; callee must be `<obj>.<op>` where obj is
  // `<root>.<model>`.
  const callee = node.callee;
  if (!callee || callee.type !== "MemberExpression" || callee.computed) return null;
  const op = callee.property && callee.property.name;
  if (!WHERE_BEARING_OPS.has(op)) return null;

  const modelMember = callee.object;
  if (
    !modelMember ||
    modelMember.type !== "MemberExpression" ||
    modelMember.computed
  ) {
    return null;
  }
  const model = modelMember.property && modelMember.property.name;
  if (!model) return null;

  const rootNode = modelMember.object;
  if (!rootNode || rootNode.type !== "Identifier") return null;
  const root = rootNode.name;

  if (!looksLikePrismaRoot(root)) return null;
  return { root, model, op };
}

/**
 * Recursively determine whether an ObjectExpression `where` value contains a
 * `tenantId` key at any depth (inline literal, nested relation predicate, or
 * inside a conditional / logical combinator). Spread elements and conditional
 * branches are treated optimistically (ANY tenantId-bearing branch → PASS),
 * mirroring the recon's substring-search behaviour. Cross-variable / helper
 * resolution is NOT performed here (ESLint has no cross-binding type info at
 * rule time) — those sites carry the EXEMPT-UPSTREAM-VERIFIED marker per the
 * Wave convention, which suppresses the flag.
 */
function whereHasTenantId(node, depth = 0) {
  if (!node || depth > 12) return false;

  switch (node.type) {
    case "ObjectExpression": {
      for (const prop of node.properties) {
        if (prop.type === "SpreadElement") {
          // `{ ...vars }` — can't statically resolve; treat conservatively as
          // potentially tenant-bearing to avoid false-flagging spread-threaded
          // wheres (the recon's EXEMPT-VIA-HELPER / spread-resolved class).
          return true;
        }
        if (prop.type !== "Property") continue;
        const keyName =
          prop.key && (prop.key.name || prop.key.value);
        if (keyName === "tenantId") return true;
        // Recurse ONLY into structural property values that can themselves
        // carry a nested tenantId (relation predicates `Lead: { tenantId }`,
        // combinators `AND: [...]`, `is: {...}`, conditionals). A leaf value
        // (`id: leadId`, `status: "active"`) is NOT tenant-bearing and must
        // not short-circuit to the opaque-default `true` — recursing a bare
        // Identifier/Literal leaf would wrongly clear an id-only where.
        const v = prop.value;
        if (
          v &&
          (v.type === "ObjectExpression" ||
            v.type === "ArrayExpression" ||
            v.type === "ConditionalExpression" ||
            v.type === "LogicalExpression") &&
          whereHasTenantId(v, depth + 1)
        ) {
          return true;
        }
      }
      return false;
    }
    case "ArrayExpression": {
      // `AND: [ { ... }, { tenantId } ]`
      for (const el of node.elements) {
        if (el && whereHasTenantId(el, depth + 1)) return true;
      }
      return false;
    }
    case "ConditionalExpression": {
      return (
        whereHasTenantId(node.consequent, depth + 1) ||
        whereHasTenantId(node.alternate, depth + 1)
      );
    }
    case "LogicalExpression": {
      return (
        whereHasTenantId(node.left, depth + 1) ||
        whereHasTenantId(node.right, depth + 1)
      );
    }
    default:
      // Identifier / CallExpression / MemberExpression as the whole `where`
      // value (`where: buildWhere(...)`, `where: someVar`). Can't statically
      // resolve — treat conservatively as potentially tenant-bearing. These
      // sites are the recon's EXEMPT-VIA-HELPER / shorthand class; the
      // EXEMPT-UPSTREAM-VERIFIED marker is the durable suppression path.
      return true;
  }
}

/**
 * Extract the `where` value node from the first-argument ObjectExpression of a
 * Prisma call. Returns { found: boolean, value: Node|null }.
 *   found=false  → no args / no `where` key (e.g. bare `findMany()`,
 *                  `count()`, or `upsert` without where) → not flaggable here.
 *   found=true, value=ObjectExpression → analyzable.
 */
function getWhereValue(node) {
  const arg = node.arguments && node.arguments[0];
  if (!arg || arg.type !== "ObjectExpression") return { found: false, value: null };
  for (const prop of arg.properties) {
    if (prop.type !== "Property") continue;
    const keyName = prop.key && (prop.key.name || prop.key.value);
    if (keyName === "where") {
      return { found: true, value: prop.value };
    }
  }
  return { found: false, value: null };
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require `tenantId` in the `where` clause of every Prisma query on a tenant-scoped model. Recognizes the EXEMPT-UPSTREAM-VERIFIED inline marker as its whitelist.",
      recommended: true,
      url: "https://github.com/rello-platform/eslint-plugin-platform-rules#require-tenantid-in-where",
    },
    schema: [
      {
        type: "object",
        properties: {
          // Allow consumers to extend / override the tenant-scoped model set
          // (e.g. another spoke with a different schema).
          additionalModels: {
            type: "array",
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingTenantId:
        "Prisma `{{model}}.{{op}}` on a tenant-scoped model has a `where` clause with no `tenantId` filter — every query must filter by tenantId (universal floor). Add `tenantId` to the where, or mark the site `// tenant-isolation: EXEMPT-UPSTREAM-VERIFIED — <trace>` if upstream-verified.",
      missingWhere:
        "Prisma `{{model}}.{{op}}` on a tenant-scoped model has no `where` clause — every query must filter by tenantId (universal floor). Add `where: { tenantId, ... }`, or mark the site `// tenant-isolation: EXEMPT-UPSTREAM-VERIFIED — <trace>` if upstream-verified.",
    },
  },

  create(context) {
    const options = (context.options && context.options[0]) || {};
    const models = new Set(TENANT_SCOPED_MODELS);
    if (Array.isArray(options.additionalModels)) {
      for (const m of options.additionalModels) models.add(m);
    }

    const sourceCode = context.sourceCode || context.getSourceCode();

    /**
     * Is the call site suppressed by an EXEMPT-UPSTREAM-VERIFIED marker?
     * Two recognized forms (Wave 1.5/2 convention):
     *  (a) per-site — a marker comment on the call's own line(s) or the line
     *      immediately above the statement.
     *  (b) block-level — a marker comment anywhere lexically above the call
     *      within the OUTERMOST enclosing function. This is what covers the
     *      canonical convention shape: a single marker placed in the enclosing
     *      function immediately ABOVE a `prisma.$transaction(async (tx) => {…})`
     *      call suppresses every tenant-scoped op inside that callback (the
     *      cascade-delete cluster). Bounding by the OUTERMOST enclosing function
     *      (not the innermost arrow body) is required because the marker sits in
     *      the outer function, before the callback's own block start. Sibling
     *      functions are never ancestors, so a marker in one function cannot
     *      leak to a call in another.
     */
    function isMarkerSuppressed(node) {
      // Walk ancestors; remember the OUTERMOST enclosing function boundary so
      // the marker search spans from there (capturing a transaction-entry
      // marker in the outer function) down to the call site. Fall back to the
      // nearest enclosing block / program if there is no enclosing function.
      let blockStart = 0;
      let outermostFnStart = null;
      let nearestBlockStart = null;
      let ancestor = node.parent;
      while (ancestor) {
        if (
          ancestor.type === "FunctionDeclaration" ||
          ancestor.type === "FunctionExpression" ||
          ancestor.type === "ArrowFunctionExpression"
        ) {
          outermostFnStart = ancestor.range[0];
        } else if (
          ancestor.type === "BlockStatement" &&
          nearestBlockStart === null
        ) {
          nearestBlockStart = ancestor.range[0];
        }
        ancestor = ancestor.parent;
      }
      blockStart =
        outermostFnStart !== null
          ? outermostFnStart
          : nearestBlockStart !== null
            ? nearestBlockStart
            : 0;

      const callEnd = node.range[1];
      // Scan all comments; any EXEMPT-UPSTREAM-VERIFIED marker that lives
      // between the enclosing block start and the call site suppresses it.
      const comments = sourceCode.getAllComments();
      for (const comment of comments) {
        if (!MARKER_RE.test(comment.value)) continue;
        if (comment.range[0] >= blockStart && comment.range[1] <= callEnd) {
          return true;
        }
        // Also accept a marker on the line(s) of the call itself (trailing /
        // same-statement) — its start may be > callEnd if it trails.
        const commentLine = comment.loc.start.line;
        if (
          commentLine >= node.loc.start.line - 1 &&
          commentLine <= node.loc.end.line
        ) {
          return true;
        }
      }
      return false;
    }

    return {
      CallExpression(node) {
        const desc = describePrismaCall(node);
        if (!desc) return;
        if (!models.has(desc.model)) return;

        const { found, value } = getWhereValue(node);

        // No where clause at all on a where-bearing op: deleteMany()/updateMany()
        // with no where is a mass operation — flag. But findUnique/findFirst
        // legitimately can omit where only in edge cases; we still flag to force
        // a marker/decision. `count()` / `aggregate()` / `groupBy()` with no
        // where are platform-wide aggregates — many are EXEMPT-SYSTEM, so do NOT
        // flag a missing-where for those read-aggregate ops (avoids noise on
        // legitimate platform snapshots); they get markers if scoped.
        if (!found) {
          if (
            desc.op === "count" ||
            desc.op === "aggregate" ||
            desc.op === "groupBy" ||
            desc.op === "findMany"
          ) {
            // Unbounded read — out of scope for the missing-where flag (the
            // recon classified bare reads case-by-case; flagging every bare
            // findMany would swamp the signal). where-present-but-no-tenantId
            // is still flagged below.
            return;
          }
          if (isMarkerSuppressed(node)) return;
          context.report({
            node,
            messageId: "missingWhere",
            data: { model: desc.model, op: desc.op },
          });
          return;
        }

        if (whereHasTenantId(value)) return;
        if (isMarkerSuppressed(node)) return;

        context.report({
          node,
          messageId: "missingTenantId",
          data: { model: desc.model, op: desc.op },
        });
      },
    };
  },
};
