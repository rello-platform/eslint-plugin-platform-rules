"use strict";
const { RuleTester } = require("eslint");
const rule = require("../lib/rules/no-network-write-on-client-interval");

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-network-write-on-client-interval", rule, {
  valid: [
    // V1 -- no "use client" directive: server/module code may legitimately poll.
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
    // V4 -- "use client" with sendBeacon on unload (event-driven, correct shape).
    {
      code: '"use client";\nwindow.addEventListener("pagehide", () => { navigator.sendBeacon("/api/x", "d"); });',
    },
    // V5 -- setInterval calling a named handler that does NO network call.
    {
      code: '"use client";\nfunction tick() { doLocalWork(); }\nsetInterval(tick, 5000);',
    },
    // V6 -- GUARDED poll: handler early-returns on document.hidden (canonical
    //       Rello NotificationDropdownProvider shape) -> suppressed.
    {
      code:
        '"use client";\n' +
        'function fetchUnread() { if (document.hidden) return; fetch("/api/x"); }\n' +
        'setInterval(fetchUnread, 30000);',
    },
    // V7 -- module wires a visibilitychange listener -> trusted, suppressed.
    {
      code:
        '"use client";\n' +
        'document.addEventListener("visibilitychange", () => {});\n' +
        'setInterval(() => { fetch("/api/x"); }, 30000);',
    },
    // V8 -- one-shot setTimeout(fetch) is not a poll loop (no re-arm).
    {
      code: '"use client";\nsetTimeout(() => { fetch("/api/x"); }, 500);',
    },
  ],
  invalid: [
    // I1 -- inline arrow handler with fetch (LabDebugPanel shape), no guard.
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
        'const fetchState = useCallback(() => { fetch("/api/state"); }, []);\n' +
        'const ref = setInterval(fetchState, 30000);',
      errors: [{ messageId: "networkOnInterval" }],
    },
    // I4 -- window.setInterval + navigator.sendBeacon on a timer, no guard.
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
    // I6 -- self-rescheduling setTimeout poll loop with fetch, no guard.
    {
      code:
        '"use client";\n' +
        'function poll() { fetch("/api/x"); setTimeout(poll, 30000); }\n' +
        'setTimeout(poll, 30000);',
      errors: [
        // Fires on both the outer kickoff and the inner re-arm (both are
        // rescheduling setTimeouts whose handler fetches).
        { messageId: "networkOnInterval" },
        { messageId: "networkOnInterval" },
      ],
    },
  ],
});

// eslint-disable-next-line no-console
console.log("no-network-write-on-client-interval: all cases passed");
