"use strict";

const { RuleTester } = require("eslint");
const tsParser = require("@typescript-eslint/parser");
const rule = require("../lib/rules/require-tenantid-in-where");

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

const FILE = "src/lib/leads/queries.ts";

ruleTester.run("require-tenantid-in-where", rule, {
  valid: [
    // tenantId present inline at top level.
    {
      code: `await prisma.lead.findFirst({ where: { id, tenantId } });`,
      filename: FILE,
    },
    // tenantId present in an updateMany write (the canonical Wave-safe shape).
    {
      code: `await prisma.lead.updateMany({ where: { id, tenantId }, data: { stage } });`,
      filename: FILE,
    },
    // tenantId nested inside a relation predicate.
    {
      code: `await prisma.note.findMany({ where: { lead: { tenantId } } });`,
      filename: FILE,
    },
    // tenantId inside an AND array.
    {
      code: `await prisma.lead.findMany({ where: { AND: [{ status: "active" }, { tenantId }] } });`,
      filename: FILE,
    },
    // tenantId inside a transaction-client callback op.
    {
      code: `await prisma.$transaction(async (tx) => { await tx.lead.update({ where: { id, tenantId }, data: {} }); });`,
      filename: FILE,
    },
    // Per-site EXEMPT-UPSTREAM-VERIFIED marker on the line above suppresses.
    {
      code: `
        // tenant-isolation: EXEMPT-UPSTREAM-VERIFIED — leadId bound to a tenant-verified Lead at L10.
        await prisma.note.deleteMany({ where: { leadId } });
      `,
      filename: FILE,
    },
    // Block-level marker INSIDE the transaction callback suppresses nested ops.
    {
      code: `
        await prisma.$transaction(async (tx) => {
          // tenant-isolation: EXEMPT-UPSTREAM-VERIFIED — parent Lead tenant-verified upstream; cascade deletes by FK.
          await tx.note.deleteMany({ where: { leadId } });
          await tx.call.deleteMany({ where: { leadId } });
          await tx.communicationLog.deleteMany({ where: { leadId } });
        });
      `,
      filename: FILE,
    },
    // Canonical convention shape: a marker in the ENCLOSING function placed
    // immediately above the `$transaction(...)` call suppresses every op inside
    // the callback (the marker sits in the outer function, before the callback
    // block start — must be honored, per the Wave 1.5/2 transaction-entry
    // marker convention).
    {
      code: `
        async function deleteLead(id, tenantId) {
          await prisma.lead.findFirst({ where: { id, tenantId } });
          // tenant-isolation: EXEMPT-UPSTREAM-VERIFIED — parent Lead tenant-verified above; cascade by FK.
          await prisma.$transaction(async (tx) => {
            await tx.note.deleteMany({ where: { leadId: id } });
            await tx.call.deleteMany({ where: { leadId: id } });
            await tx.task.deleteMany({ where: { leadId: id } });
          });
        }
      `,
      filename: FILE,
    },
    // Spread-threaded where — can't statically resolve, treated as tenant-bearing
    // (the recon's EXEMPT-VIA-HELPER / shorthand class). Not flagged.
    {
      code: `await prisma.lead.findMany({ where: { ...baseWhere, status: "active" } });`,
      filename: FILE,
    },
    // Non-tenant-scoped model (not in the schema's tenantId set) — out of scope.
    {
      code: `await prisma.someGlobalRefTable.findUnique({ where: { id } });`,
      filename: FILE,
    },
    // Not a prisma-rooted call.
    {
      code: `await fetcher.lead.update({ where: { id } });`,
      filename: FILE,
    },
    // Bare read aggregate with no where — deliberately out of scope (platform
    // snapshot reads get case-by-case markers, not blanket flags).
    {
      code: `await prisma.lead.count();`,
      filename: FILE,
    },
    // create has no where — never flagged.
    {
      code: `await prisma.lead.create({ data: { tenantId } });`,
      filename: FILE,
    },
  ],
  invalid: [
    // Bare where with id only on a tenant-scoped model.
    {
      code: `await prisma.lead.findFirst({ where: { id } });`,
      filename: FILE,
      errors: [{ messageId: "missingTenantId" }],
    },
    // update with id-only where (the silent cross-tenant write class).
    {
      code: `await prisma.communicationLog.update({ where: { id }, data: { status: "sent" } });`,
      filename: FILE,
      errors: [{ messageId: "missingTenantId" }],
    },
    // deleteMany with no where (mass op) on a tenant-scoped model.
    {
      code: `await prisma.note.deleteMany();`,
      filename: FILE,
      errors: [{ messageId: "missingWhere" }],
    },
    // Nested relation predicate WITHOUT tenantId.
    {
      code: `await prisma.note.findMany({ where: { lead: { id: leadId } } });`,
      filename: FILE,
      errors: [{ messageId: "missingTenantId" }],
    },
    // Transaction-client op missing tenantId, no marker.
    {
      code: `await prisma.$transaction(async (tx) => { await tx.lead.update({ where: { id }, data: {} }); });`,
      filename: FILE,
      errors: [{ messageId: "missingTenantId" }],
    },
    // A marker in a DIFFERENT function does NOT suppress this call.
    {
      code: `
        function exemptOne() {
          // tenant-isolation: EXEMPT-UPSTREAM-VERIFIED — scoped elsewhere.
          return prisma.lead.findMany({ where: { ownerId } });
        }
        function bare() {
          return prisma.lead.findFirst({ where: { id } });
        }
      `,
      filename: FILE,
      errors: [{ messageId: "missingTenantId" }],
    },
  ],
});
