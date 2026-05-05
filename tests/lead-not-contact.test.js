"use strict";

const { RuleTester } = require("eslint");
const tsParser = require("@typescript-eslint/parser");
const rule = require("../lib/rules/lead-not-contact");

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

const SRC = "src/lib/leads.ts";
const TEST = "src/lib/leads.test.ts";
const LEGACY = "src/legacy/contacts.ts";

ruleTester.run("lead-not-contact", rule, {
  valid: [
    // Canonical Lead identifier.
    { code: "const lead = {};", filename: SRC },
    { code: "type LeadId = string;", filename: SRC },
    // Test file — exempt.
    { code: "const contact = {};", filename: TEST },
    // Legacy path — exempt.
    { code: "const contactId = '';", filename: LEGACY },
    // String literal containing the word — unaffected by Identifier visitor.
    { code: 'const msg = "Contact us";', filename: SRC },
    // Legacy-prefixed identifier — exempt.
    { code: "const legacyContact = {};", filename: SRC },
  ],
  invalid: [
    {
      code: "const contact = {};",
      filename: SRC,
      errors: [{ messageId: "contactIdentifier" }],
    },
    {
      code: "type ContactId = string;",
      filename: SRC,
      errors: [{ messageId: "contactIdentifier" }],
    },
    {
      code: "function getContacts() { return []; }",
      filename: SRC,
      errors: [{ messageId: "contactIdentifier" }],
    },
    {
      code: "const x = obj.contactId;",
      filename: SRC,
      errors: [{ messageId: "contactIdentifier" }],
    },
  ],
});
