"use strict";

const { RuleTester } = require("eslint");
const rule = require("../lib/rules/no-empty-catches");

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-empty-catches", rule, {
  valid: [
    {
      code: "p.catch((err) => { console.error('op failed:', err); });",
    },
    {
      code: "try { foo(); } catch (e) { console.error('foo failed:', e); }",
    },
    {
      code: "p.catch(handler);",
    },
    {
      code: "p.catch(async (err) => { await log(err); });",
    },
  ],
  invalid: [
    {
      code: "p.catch(() => {});",
      errors: [{ messageId: "emptyCatchHandler" }],
    },
    {
      code: "p.catch(() => undefined);",
      errors: [{ messageId: "emptyCatchHandler" }],
    },
    {
      code: "p.catch(() => null);",
      errors: [{ messageId: "emptyCatchHandler" }],
    },
    {
      code: "try { foo(); } catch {}",
      errors: [{ messageId: "emptyCatchBlock" }],
    },
    {
      code: "try { foo(); } catch (e) {}",
      errors: [{ messageId: "emptyCatchBlock" }],
    },
  ],
});
