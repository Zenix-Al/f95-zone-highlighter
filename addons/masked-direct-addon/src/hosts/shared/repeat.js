import { sleep } from "../../shared/utils.js";
import { isElementReadyForClick } from "./dom.js";

function settings(definition, context) {
  const source =
    context.settings?.directDownload?.[definition.settingsKey] ||
    context.settings?.[definition.settingsKey] ||
    {};
  const number = (key, fallback) =>
    Number.isFinite(Number(source[key])) && Number(source[key]) >= 0
      ? Number(source[key])
      : fallback;
  return {
    timeoutMs: Math.min(definition.timeoutMs, number("totalFlowTimeout", definition.timeoutMs)),
    intervalMs: Math.max(100, number("pollInterval", definition.intervalMs)),
    frameBudgetMs: number("scanFrameBudgetMs", definition.frameBudgetMs),
  };
}

export async function findBestAction(
  definition,
  { frameBudgetMs = definition.frameBudgetMs, isDone = () => false, signal } = {},
) {
  const controls = document.querySelectorAll(definition.selector);
  let best = null,
    count = 0,
    frame = performance.now();
  for (const element of controls) {
    if (isDone() || signal?.aborted) return null;
    const text = String(element.textContent || element.value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (
      isElementReadyForClick(element) &&
      definition.visible(element) &&
      !definition.exclude(text)
    ) {
      const action = definition.actions.find((item) => item.match(text));
      if (action && (!best || action.priority < best.priority)) {
        best = { ...action, element, kind: action.id, text };
        count = 1;
      } else if (action && action.priority === best?.priority) count += 1;
    }
    if (performance.now() - frame >= frameBudgetMs) {
      await sleep(16, signal);
      frame = performance.now();
    }
  }
  return count === 1 ? best : null;
}

// Bounded observation belongs to the shared tool, not any host. Returning starts
// a scope-owned operation; its terminal callback or abort owns completion.
export function startRepeat(definition, context, dispatch) {
  const timing = settings(definition, context);
  const { signal, challengeGate } = context;
  const controller = new AbortController();
  const local = { ...context, signal: controller.signal };
  let done = false,
    running = false,
    dirty = true,
    lastScan = -Infinity;
  let observer, poll, timeout;
  const clicked = new WeakMap();
  function cleanup() {
    if (done) return;
    done = true;
    controller.abort();
    observer?.disconnect();
    clearInterval(poll);
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cleanup);
    window.removeEventListener("pagehide", cleanup);
  }
  async function scan() {
    if (done || running || (!dirty && Date.now() - lastScan < 1000)) return;
    running = true;
    dirty = false;
    try {
      if (challengeGate && !(await challengeGate.waitUntilClear())) {
        cleanup();
        return;
      }
      if (done) return;
      const action = await findBestAction(definition, {
        frameBudgetMs: timing.frameBudgetMs,
        isDone: () => done,
        signal: controller.signal,
      });
      lastScan = Date.now();
      if (!action || done) return;
      const at = clicked.get(action.element);
      if (at !== undefined && Date.now() - at < definition.cooldownMs) return;
      clicked.set(action.element, Date.now());
      if (action.final) {
        // Retire observation before final dispatch: an uncertain click is never retried.
        observer.disconnect();
        clearInterval(poll);
        action.element.setAttribute(definition.finalMarker, "true");
      }
      const result = await dispatch(
        {
          ...action,
          select: () => action.element,
          validate: (element) => {
            const text = String(element.textContent || element.value || "")
              .replace(/\s+/g, " ")
              .trim()
              .toLowerCase();
            return (
              isElementReadyForClick(element) &&
              definition.visible(element) &&
              !definition.exclude(text) &&
              definition.actions.find((item) => item.match(text))?.id === action.id
            );
          },
        },
        local,
        action.element,
      );
      if (action.final || result === false) cleanup();
    } catch (error) {
      if (done || controller.signal.aborted) return;
      cleanup();
      await context.notifyMainFailure(definition.host, error.message);
    } finally {
      running = false;
    }
  }
  function changed(records) {
    if (
      records.some((record) => {
        const target = record.target.nodeType === 3 ? record.target.parentElement : record.target;
        return (
          target?.matches?.(definition.selector) ||
          target?.closest?.(definition.selector) ||
          [...(record.addedNodes || []), ...(record.removedNodes || [])].some(
            (node) =>
              node.matches?.(definition.selector) || node.querySelector?.(definition.selector),
          ) ||
          (record.type === "attributes" && target?.querySelector?.(definition.selector))
        );
      })
    ) {
      dirty = true;
      void scan();
    }
  }
  // Existing host-local observer moved here; no core observer dependency.
  observer = new MutationObserver(changed);
  if (document.body)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["disabled", "aria-disabled", "style", "class", "hidden", "value"],
    });
  poll = setInterval(() => {
    void scan();
  }, timing.intervalMs);
  timeout = setTimeout(() => {
    cleanup();
    void context.notifyMainFailure(
      definition.host,
      definition.timeoutMessage || "Download automation timed out. Please continue manually.",
      "timeout",
    );
  }, timing.timeoutMs);
  signal?.addEventListener("abort", cleanup, { once: true });
  window.addEventListener("pagehide", cleanup, { once: true });
  if (signal?.aborted) cleanup();
  else void scan();
}
