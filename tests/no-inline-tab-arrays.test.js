"use strict";

const { RuleTester } = require("eslint");
const tsParser = require("@typescript-eslint/parser");
const rule = require("../lib/rules/no-inline-tab-arrays");

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

const ADMIN_PAGE = "src/app/(super-admin)/admin/rates/page.tsx";
const TABS_MODULE = "src/app/(super-admin)/admin/rates/rates-tabs.ts";
const NON_ADMIN = "src/components/Foo.tsx";

ruleTester.run("no-inline-tab-arrays", rule, {
  valid: [
    {
      code: 'const TABS = [{ slug: "a", label: "A" }];',
      filename: TABS_MODULE,
    },
    {
      code: 'import { TABS } from "./rates-tabs";',
      filename: ADMIN_PAGE,
    },
    {
      code: 'const TABS = [];',
      filename: NON_ADMIN,
    },
  ],
  invalid: [
    {
      code: 'const TABS = [{ slug: "a" }, { slug: "b" }];',
      filename: ADMIN_PAGE,
      errors: [{ messageId: "inlineTabsArray" }],
    },
    {
      code: 'type TopLevelTab = "a" | "b";',
      filename: ADMIN_PAGE,
      errors: [{ messageId: "redeclaredTopLevelTab" }],
    },
    {
      code: 'import { TABS } from "./page";',
      filename: ADMIN_PAGE,
      errors: [{ messageId: "siblingTabsImport" }],
    },
  ],
});
