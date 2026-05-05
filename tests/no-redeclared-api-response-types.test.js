"use strict";

const { RuleTester } = require("eslint");
const tsParser = require("@typescript-eslint/parser");
const rule = require("../lib/rules/no-redeclared-api-response-types");

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

const ROUTE = "src/app/api/admin/foo/route.ts";
const ADMIN_PAGE = "src/app/(super-admin)/admin/foo/page.tsx";
const COMPONENT = "src/components/admin/FooBar.tsx";
const LIB = "src/lib/util.ts";

ruleTester.run("no-redeclared-api-response-types", rule, {
  valid: [
    // Canonical owner — declaration here is fine.
    {
      code: "export interface FooResponse { id: string; }",
      filename: ROUTE,
    },
    // Non-Response interface — unaffected.
    {
      code: "interface FooProps { id: string; }",
      filename: ADMIN_PAGE,
    },
    // Lib file — outside consumer scope — unaffected.
    {
      code: "interface FooResponse { id: string; }",
      filename: LIB,
    },
    // Consumer importing canonical type — clean.
    {
      code: 'import type { FooResponse } from "@/app/api/admin/foo/route";',
      filename: ADMIN_PAGE,
    },
  ],
  invalid: [
    {
      code: "interface FooResponse { id: string; }",
      filename: ADMIN_PAGE,
      errors: [{ messageId: "redeclaredResponse" }],
    },
    {
      code: "interface BarResponse { ok: boolean; }",
      filename: COMPONENT,
      errors: [{ messageId: "redeclaredResponse" }],
    },
  ],
});
