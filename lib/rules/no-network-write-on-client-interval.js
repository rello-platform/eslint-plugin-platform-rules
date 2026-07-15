"use strict";

/**
 * @fileoverview Flag a network call (`fetch(...)` / `navigator.sendBeacon(...)`)
 * driven by a `setInterval` inside a `"use client"` module — a periodic
 * client→server call on a timer.
 *
 * Why this is a cost/autosuspend hazard: a `"use client"` component that POSTs
 * (or even GETs) on a fixed interval keeps calling the server every beat for as
 * long as the tab is open — including while the tab is BACKGROUNDED, where the
 * browser still fires the timer (throttled to ~60s). Each call authenticates and
 * usually writes on the shared Neon hub, so a single abandoned/hidden portal tab
 * pins the endpoint awake 24/7 and defeats Neon autosuspend (the always-on
 * compute cost bleed). This is the exact drift class behind DISPATCH-31: the
 * TheHomeStretch portal engagement heartbeat (`useEngagementTracking`
 * setInterval → POST /api/portal/track → prisma.event.create per beat) held
 * ep-hidden-forest awake for 23h.
 *
 * The correct shape (see DISPATCH-31): a client timer that (a) clears itself
 * while `document.hidden`, (b) stops after an idle window, and (c) emits only on
 * a real milestone / on unload — so a hidden/idle tab performs ZERO network
 * writes. Because that "pauses when hidden/idle" property is not statically
 * decidable, this rule is a HEURISTIC (severity: warn): it points the reviewer
 * at every client-interval network call so the guard above can be confirmed. If
 * a given poller is genuinely safe (short-lived, cleared on hide, not hub-bound),
 * disable it inline with a one-line justification.
 *
 * Realizes: NEON-AUTOSUSPEND heartbeat-write drift class. Codified per
 * `BUILD-|-WORKSTREAM/PLATFORM-COST-CONTROL/DISPATCH-31-*`.
 */

// Callees that constitute a client→server network call for this rule's purposes.
// `fetch(...)` (also `window.fetch`) and `*.sendBeacon(...)` (navigator.sendBeacon)
// cover the platform's client telemetry paths. XMLHttpRequest `.send()` is
// intentionally excluded — `.send` is too generic and would false-positive.
function isNetworkCallee(callee) {
  if (!callee) return false;
  if (callee.type === "Identifier" && callee.name === "fetch") return true;
  if (callee.type === "MemberExpression") {
    // window.fetch(...)
    if (
      callee.property &&
      callee.property.type === "Identifier" &&
      callee.property.name === "fetch"
    ) {
      return true;
    }
    // navigator.sendBeacon(...) / x.sendBeacon(...)
    if (
      callee.property &&
      callee.property.type === "Identifier" &&
      callee.property.name === "sendBeacon"
    ) {
      return true;
    }
  }
  return false;
}

// `setInterval(...)` or `window.setInterval(...)`.
function isSetInterval(callee) {
  if (!callee) return false;
  if (callee.type === "Identifier" && callee.name === "setInterval") return true;
  if (
    callee.type === "MemberExpression" &&
    callee.property &&
    callee.property.type === "Identifier" &&
    callee.property.name === "setInterval"
  ) {
    return true;
  }
  return false;
}

// Does `"use client"` appear as a leading directive of the module?
function hasUseClientDirective(program) {
  if (!program || !Array.isArray(program.body)) return false;
  for (const stmt of program.body) {
    if (stmt.type !== "ExpressionStatement") break; // directives are leading only
    const expr = stmt.expression;
    if (expr && expr.type === "Literal" && expr.value === "use client") return true;
  }
  return false;
}

// Unwrap a node to the concrete function bodies it represents:
//  - an arrow/function expression or declaration → itself
//  - `useCallback(fn, deps)` / `useMemo(() => ..., deps)` → its function arg(s)
function functionBodiesFrom(node) {
  if (!node) return [];
  if (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression" ||
    node.type === "FunctionDeclaration"
  ) {
    return [node];
  }
  if (node.type === "CallExpression") {
    const out = [];
    for (const arg of node.arguments || []) out.push(...functionBodiesFrom(arg));
    return out;
  }
  return [];
}

// Resolve an identifier to its declaring variable, walking outward from `scope`.
function resolveVariable(scope, name) {
  let s = scope;
  while (s) {
    const v = s.set.get(name);
    if (v) return v;
    s = s.upper;
  }
  return null;
}

// Does the subtree rooted at `root` contain a network CallExpression?
function subtreeHasNetworkCall(root) {
  const stack = [root];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    if (cur.type === "CallExpression" && isNetworkCallee(cur.callee)) return true;
    for (const key in cur) {
      if (key === "parent") continue;
      const val = cur[key];
      if (Array.isArray(val)) {
        for (const c of val) if (c && typeof c === "object" && typeof c.type === "string") stack.push(c);
      } else if (val && typeof val === "object" && typeof val.type === "string") {
        stack.push(val);
      }
    }
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Flag a network call (fetch / sendBeacon) driven by setInterval in a 'use client' module — a client-interval server call pins Neon compute awake while the tab is open/backgrounded and defeats autosuspend. Emit on milestone/unload with a hidden/idle pause instead (DISPATCH-31).",
      recommended: true,
      url: "https://github.com/rello-platform/eslint-plugin-platform-rules#no-network-write-on-client-interval",
    },
    schema: [],
    messages: {
      networkOnInterval:
        "Network call on a client setInterval: this fires every beat for as long as the tab is open (including backgrounded), waking the shared Neon hub each time and defeating autosuspend (DISPATCH-31). Pause the timer while document.hidden, stop it after an idle window, and emit only on a milestone / on unload — so a hidden/idle tab performs ZERO network writes. If this poller is genuinely safe, disable inline with a justification.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    if (!hasUseClientDirective(sourceCode.ast)) return {};

    return {
      CallExpression(node) {
        if (!isSetInterval(node.callee)) return;
        const handler = node.arguments && node.arguments[0];
        if (!handler) return;

        // Collect the function bodies the handler resolves to.
        let bodies = functionBodiesFrom(handler);
        if (bodies.length === 0 && handler.type === "Identifier") {
          const scope =
            typeof sourceCode.getScope === "function"
              ? sourceCode.getScope(node)
              : context.getScope();
          const variable = resolveVariable(scope, handler.name);
          if (variable) {
            for (const def of variable.defs || []) {
              if (def.node.type === "FunctionDeclaration") {
                bodies.push(def.node);
              } else if (def.node.type === "VariableDeclarator") {
                bodies.push(...functionBodiesFrom(def.node.init));
              }
            }
          }
        }

        for (const body of bodies) {
          if (subtreeHasNetworkCall(body)) {
            context.report({ node, messageId: "networkOnInterval" });
            return;
          }
        }
      },
    };
  },
};

module.exports.isNetworkCallee = isNetworkCallee;
module.exports.isSetInterval = isSetInterval;
