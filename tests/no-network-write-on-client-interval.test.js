"use strict";
const { RuleTester } = require("eslint");
const rule = require("../lib/rules/no-network-write-on-client-interval");

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-network-write-on-client-interval", rule, {
  valid: [
    // V1 -- no "use client" directive: server/module code may legitimately poll
    // (cron pollers, node scripts) — out of scope.
    {
      code: 'setInterval(() => { fetch("/api/x"); }, 1000);',
    },
    // V2 -- "use client" but the interval does NO network call (state tick only).
    {
      code: '"use client";\nlet n = 0;\nsetInterval(() => { n += 1; }, 1000);',
    },
    // V3 -- "use client" with a fetch, but NOT on an interval (event-driven).
    {
      code: '"use client";\nfunction onClick() { fetch("/api/x", { method: "POST" }); }',
    },
    // V4 -- "use client" with sendBeacon on unload (event-driven, the correct shape).
    {
      code: '"use client";\nwindow.addEventListener("pagehide", () => { navigator.sendBeacon("/api/x", "d"); });',
    },
    // V5 -- setInterval calling a named handler that does NO network call.
    {
      code: '"use client";\nfunction tick() { doLocalWork(); }\nsetInterval(tick, 5000);',
    },
  ],
  invalid: [
    // I1 -- inline arrow handler with fetch (LabDebugPanel shape).
    {
      code: '"use client";\nsetInterval(() => { fetch("/api/lab/debug-log"); }, 3000);',
      errors: [{ messageId: "networkOnInterval" }],
    },
    // I2 -- named function handler with fetch, resolved via scope
    //       (the THS useEngagementTracking `setInterval(sendHeartbeat, ...)` shape).
    {
      code:
        '"use client";\n' +
        'function sendHeartbeat() { fetch("/api/portal/track", { method: "POST" }); }\n' +
        'setInterval(sendHeartbeat, 30000);',
      errors: [{ messageId: "networkOnInterval" }],
    },
    // I3 -- useCallback-wrapped handler referenced by identifier (React idiom).
    {
      code:
        '"use client";\n' +
        'const sendHeartbeat = useCallback(() => { fetch("/api/portal/track", { method: "POST" }); }, []);\n' +
        'const ref = setInterval(sendHeartbeat, 30000);',
      errors: [{ messageId: "networkOnInterval" }],
    },
    // I4 -- window.setInterval + navigator.sendBeacon on a timer.
    {
      code: '"use client";\nwindow.setInterval(() => { navigator.sendBeacon("/api/x", "d"); }, 60000);',
      errors: [{ messageId: "networkOnInterval" }],
    },
    // I5 -- network call nested inside an inner function within the handler.
    {
      code:
        '"use client";\n' +
        'setInterval(() => { const go = async () => { await fetch("/api/x"); }; go(); }, 10000);',
      errors: [{ messageId: "networkOnInterval" }],
    },
  ],
});

// eslint-disable-next-line no-console
console.log("no-network-write-on-client-interval: all cases passed");
