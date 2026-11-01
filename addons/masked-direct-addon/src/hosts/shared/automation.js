import { TIMINGS } from "../constants.js";
import { queryAllBySelectors, sleep } from "../../shared/utils.js";
import { clickElement } from "./dom.js";
import { startRepeat } from "./repeat.js";
import { findHostRoute } from "./routes.js";

const value = (setting, options) => (typeof setting === "function" ? setting(options) : setting);
const duration = (setting, options, fallback = 0) =>
  Math.max(0, Number(value(setting, options) ?? fallback) || 0);

export async function actionGate(context) {
  context.signal?.throwIfAborted();
  return !context.challengeGate || (await context.challengeGate.waitUntilClear());
}

function prepare(element, operations = []) {
  for (const operation of operations) {
    if (operation === "scroll") element.scrollIntoView?.({ block: "center", behavior: "instant" });
    else if (operation === "focus") element.focus?.({ preventScroll: true });
    else if (operation === "self") element.target = "_self";
    else if (operation === "removeRel") element.removeAttribute("rel");
    else throw new Error(`Unknown preparation: ${operation}`);
  }
}

function select(action, context) {
  if (action.inspect) {
    const result = action.inspect(context);
    if (result?.status === "unsafe")
      throw new Error(result.message || "Automation requires exactly one file.");
    return result?.status === "ready" ? result.element || result.button : null;
  }
  if (action.select) return action.select(context);
  return queryAllBySelectors(action.selectors).find(action.validate || (() => true)) || null;
}

async function candidate(action, context) {
  const end = Date.now() + duration(action.timeoutMs, context, 20000);
  const initialized = new WeakSet();
  let previous = null,
    stable = 0;
  while (Date.now() < end) {
    context.signal?.throwIfAborted();
    if (context.challengeGate?.isBlocked?.()) {
      if (!(await actionGate(context))) return null;
      previous = null;
      stable = 0;
    }
    const element = select(action, context);
    if (element && (!action.ready || action.ready(element))) {
      stable = element === previous ? stable + 1 : 0;
      previous = element;
      if (stable >= duration(action.stableChecks, context)) return element;
    } else {
      previous = null;
      stable = 0;
      if (
        element &&
        action.initialize &&
        !initialized.has(element) &&
        typeof window[action.initialize] === "function"
      ) {
        try {
          window[action.initialize]();
          initialized.add(element);
        } catch {
          /* Best effort site initialization. */
        }
      }
    }
    await sleep(
      Math.max(1, duration(action.intervalMs, context, TIMINGS.POLL_INTERVAL)),
      context.signal,
    );
  }
  return null;
}

async function execute(action, context, existing) {
  if (!(await actionGate(context))) return false;
  if (action.tool === "delay") {
    await sleep(duration(action.ms, context), context.signal);
    return true;
  }
  if (action.tool === "healthy") {
    context.reportAddonHealthy();
    return false;
  }
  if (!["click", "navigate"].includes(action.tool))
    throw new Error(`Unknown host tool: ${action.tool}`);
  const element = existing || (await candidate(action, context));
  if (!element) throw new Error(action.errors?.missing || "Download action not found.");
  const observed = action.read?.(element);
  if (action.check && !action.check(element, observed))
    throw new Error(action.errors?.invalid || "Download action is invalid.");
  if (action.readyDelayMs !== undefined)
    await sleep(duration(action.readyDelayMs, context), context.signal);
  if (!(await actionGate(context))) return false;
  const find = () => select(action, context);
  const valid = action.revalidate
    ? action.revalidate(element, find, context)
    : action.inspect
      ? find() === element
      : !action.validate || action.validate(element);
  if (
    !element.isConnected ||
    !valid ||
    (action.ready && !action.ready(element)) ||
    (action.read && action.read(element) !== observed)
  )
    throw new Error(action.errors?.changed || "Download button changed before dispatch.");
  if (action.skipDispatch?.(element, context)) return true;
  prepare(element, action.prepare);
  context.signal?.throwIfAborted();
  if (action.tool === "navigate") {
    const url = action.url(element, context);
    const target = new URL(url, location.href);
    if (
      !["https:", "http:"].includes(target.protocol) ||
      (action.allowUrl && !action.allowUrl(target))
    )
      throw new Error("Unsafe download destination.");
    location.assign(target.href);
  } else if (!clickElement(element))
    throw new Error(action.errors?.click || "Unable to trigger download button.");
  if (context.definition.recent) {
    try {
      sessionStorage.setItem(value(context.definition.recent.key, context), String(Date.now()));
    } catch {
      /* Optional tab-local guard. */
    }
  }
  if (action.graceMs !== undefined) await sleep(duration(action.graceMs, context), context.signal);
  if (!(await actionGate(context))) return false;
  if (value(action.final, context) === true) {
    context.reportAddonHealthy({ downloadTriggered: true });
    return false;
  }
  return action.tool !== "navigate";
}

export function createHostAutomation(definition) {
  const processor = async (options) => {
    const context = {
      ...options,
      definition,
      signal: options.signal || options.challengeGate?.signal,
    };
    context.route = findHostRoute(definition);
    const host = value(definition.host, context) || definition.canonicalHost;
    try {
      if (!context.route) throw new Error(definition.routeError || "Unsupported download page.");
      if (definition.recent) {
        let at = 0;
        try {
          at = Number(sessionStorage.getItem(value(definition.recent.key, context)));
        } catch {
          /* Optional guard. */
        }
        if (at > 0 && Date.now() - at < definition.recent.ttlMs) {
          context.reportAddonHealthy();
          return;
        }
      }
      if (definition.mode === "repeat") return startRepeat(definition, context, execute);
      for (const action of definition.actions) {
        if (action.whenRoute && context.route.kind !== action.whenRoute) continue;
        if (action.when && !action.when(context)) continue;
        if (!(await execute(action, context))) break;
      }
    } catch (error) {
      if (context.signal?.aborted || error?.name === "AbortError") throw error;
      await context.notifyMainFailure(host, error.message);
    }
  };
  processor.definition = definition;
  return processor;
}
