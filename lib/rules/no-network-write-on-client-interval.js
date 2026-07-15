"use strict";

/**
 * @fileoverview Flag a network call (`fetch(...)` / `navigator.sendBeacon(...)`)
 * driven by a `setInterval` (or a self-rescheduling `setTimeout` loop) inside a
 * `"use client"` module that does NOT gate on tab visibility.
 *
 * Why this is a cost/autosuspend hazard: a `"use client"` component that calls
 * the server on a fixed timer keeps firing for as long as the tab is open —
 * including while the tab is BACKGROUNDED, where the browser still runs the timer
 * (throttled to ~60s, never stopped). Each call at minimum authenticates against
 * the shared Neon hub (a session lookup) and usually writes, so a single
 * abandoned/hidden tab pins the endpoint awake 24/7 and defeats Neon autosuspend
 * (the always-on-compute cost bleed). This is the drift class behind DISPATCH-31:
 * the TheHomeStretch portal engagement heartbeat (`useEngagementTracking`
 * setInterval → POST /api/portal/track → prisma.event.create per beat) held
 * ep-hidden-forest awake for 23h, and a platform sweep found the same shape
 * fanned out across ~two dozen dashboard pollers.
 *
 * The correct shape (see Rello `NotificationDropdownProvider`): gate the poll on
 * `document.hidden` (early-return while hidden) and refetch on the
 * `visibilitychange` → visible transition, or use React-Query `refetchInterval`
 * with `refetchIntervalInBackground: false` (which auto-pauses on blur). This
 * rule SUPPRESSES when the module already references `document.hidden` /
 * `visibilityState` / a `"visibilitychange"` listener — so it flags only the
 * UNGUARDED pollers and never the canonical good pattern. React-Query pollers are
 * never matched (they use no `setInterval`).
 *
 * Severity: warn (heuristic) — the "pauses on hidden" property is confirmed by a
 * coarse module-level signal, so a file that handles visibility elsewhere is
 * trusted. If a flagged poller is genuinely safe, disable inline with a reason.
 *
 * Realizes: NEON-AUTOSUSPEND client-heartbeat drift class. Codified per
 * `BUILD-|-WORKSTREAM/PLATFORM-COST-CONTROL/DISPATCH-31-*`.
 */

// Callees that constitute a client→server network call for this rule's purposes.
// `fetch(...)` (also `window.fetch`) and `*.sendBeacon(...)` (navigator.sendBeacon)
// cover the platform's client telemetry paths. XMLHttpRequest `.send()` is
// intentionally excluded — `.send` is too generic and would false-positive.
function isNetworkCallee(callee) {
  if (!callee) return false;
  if (callee.type === "Identifier" && callee.name === "fetch") return true;
  if (callee.type === "MemberExpression" && callee.property && callee.property.type === "Identifier") {
    if (callee.property.name === "fetch") return true; // window.fetch(...)
    if (callee.property.name === "sendBeacon") return true; // navigator.sendBeacon(...)
  }
  return false;
}

// Is `callee` a call to `name` (bare `name(...)` or `window.name(...)`)?
function isTimerCallee(callee, name) {
  if (!callee) return false;
  if (callee.type === "Identifier" && callee.name === name) return true;
  if (
    callee.type === "MemberExpression" &&
    callee.property &&
    callee.property.type === "Identifier" &&
    callee.property.name === name
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

// Walk the subtree rooted at `root`, calling `visit(node)` for every AST node;
// `visit` returning true short-circuits with true.
function someInSubtree(root, visit) {
  const stack = [root];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    if (visit(cur)) return true;
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

function subtreeHasNetworkCall(root) {
  return someInSubtree(root, (n) => n.type === "CallExpression" && isNetworkCallee(n.callee));
}

// A self-rescheduling setTimeout loop: the handler subtree re-arms via setTimeout.
function subtreeReschedulesTimeout(root) {
  return someInSubtree(root, (n) => n.type === "CallExpression" && isTimerCallee(n.callee, "setTimeout"));
}

// Module-level signal that the author handles tab-visibility: a `document.hidden`
// / `*.visibilityState` read, or a `"visibilitychange"` listener registration.
function moduleHandlesVisibility(program) {
  return someInSubtree(program, (n) => {
    if (n.type === "MemberExpression" && n.property && n.property.type === "Identifier") {
      if (n.property.name === "hidden" && n.object && n.object.type === "Identifier" && n.object.name === "document") {
        return true;
      }
      if (n.property.name === "visibilityState") return true;
    }
    if (n.type === "Literal" && n.value === "visibilitychange") return true;
    return false;
  });
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Flag a network call (fetch / sendBeacon) driven by an UNGUARDED client setInterval / self-rescheduling setTimeout — a client-interval server call pins Neon compute awake while the tab is open/backgrounded and defeats autosuspend. Gate on document.hidden + visibilitychange, or use React-Query refetchInterval (DISPATCH-31).",
      recommended: true,
      url: "https://github.com/rello-platform/eslint-plugin-platform-rules#no-network-write-on-client-interval",
    },
    schema: [],
    messages: {
      networkOnInterval:
        "Network call on an unguarded client timer: this fires every beat for as long as the tab is open (including backgrounded), waking the shared Neon hub each time and defeating autosuspend (DISPATCH-31). Gate the poll on `document.hidden` (early-return) and refetch on `visibilitychange`, or use React-Query `refetchInterval` with `refetchIntervalInBackground: false`. If this poller is genuinely safe, disable inline with a justification.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    if (!hasUseClientDirective(sourceCode.ast)) return {};
    // Coarse module-level guard signal: if the file handles visibility anywhere,
    // trust it (avoids flagging the canonical document.hidden / visibilitychange
    // pause-resume pattern).
    if (moduleHandlesVisibility(sourceCode.ast)) return {};

    function checkTimer(node) {
      const handler = node.arguments && node.arguments[0];
      if (!handler) return;

      // Collect the function bodies the handler resolves to.
      const bodies = functionBodiesFrom(handler);
      if (bodies.length === 0 && handler.type === "Identifier") {
        const scope =
          typeof sourceCode.getScope === "function" ? sourceCode.getScope(node) : context.getScope();
        const variable = resolveVariable(scope, handler.name);
        if (variable) {
          for (const def of variable.defs || []) {
            if (def.node.type === "FunctionDeclaration") bodies.push(def.node);
            else if (def.node.type === "VariableDeclarator") bodies.push(...functionBodiesFrom(def.node.init));
          }
        }
      }

      // setTimeout only counts as a poll LOOP when its handler re-arms via
      // setTimeout (recursive poller) — a one-shot setTimeout(fetch) is not a loop.
      if (isTimerCallee(node.callee, "setTimeout") && !bodies.some((b) => subtreeReschedulesTimeout(b))) {
        return;
      }

      for (const body of bodies) {
        if (subtreeHasNetworkCall(body)) {
          context.report({ node, messageId: "networkOnInterval" });
          return;
        }
      }
    }

    return {
      CallExpression(node) {
        if (isTimerCallee(node.callee, "setInterval") || isTimerCallee(node.callee, "setTimeout")) {
          checkTimer(node);
        }
      },
    };
  },
};

module.exports.isNetworkCallee = isNetworkCallee;
module.exports.moduleHandlesVisibility = moduleHandlesVisibility;
