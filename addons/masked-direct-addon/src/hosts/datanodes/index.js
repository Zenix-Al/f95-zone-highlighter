import { TIMINGS } from "../../constants.js";
import { clickElement, isElementReadyForClick } from "../shared/dom.js";

const HOST_LABEL = "datanodes.to";
const TIMER_PATCH_MARKER = "__f95ue_datanodes_timer_patch";
const CLICK_MARKER = "data-f95ue-datanodes-clicked";
const CLICK_COOLDOWN_MS = 900;
const SCAN_FRAME_BUDGET_MS = 5;
const SCAN_POLL_INTERVAL_MS = 500;

function getDatanodesTiming(settings = {}) {
  const datanodes =
    settings?.directDownload?.datanodes || settings?.datanodes || {};

  function numberValue(key, fallback) {
    const value = Number(datanodes[key]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  return {
    pollInterval: numberValue(
      "pollInterval",
      TIMINGS.DATANODES_POLL_INTERVAL || SCAN_POLL_INTERVAL_MS,
    ),
    totalFlowTimeout: numberValue(
      "totalFlowTimeout",
      TIMINGS.DATANODES_TOTAL_FLOW_TIMEOUT || 90000,
    ),
    scanFrameBudgetMs: numberValue("scanFrameBudgetMs", SCAN_FRAME_BUDGET_MS),
  };
}

function patchDatanodesTimers() {
  try {
    if (window[TIMER_PATCH_MARKER]) return;
    window[TIMER_PATCH_MARKER] = true;

    for (const key of ["downloadCountdown", "seconds", "count"]) {
      if (typeof window[key] !== "undefined") {
        window[key] = 0;
      }
    }

    const originalSetInterval = window.setInterval;
    window.setInterval = function f95ueDatanodesSetInterval(
      fn,
      delay,
      ...rest
    ) {
      let nextDelay = delay;
      try {
        const source = String(fn || "").toLowerCase();
        if (
          source.includes("preparing") ||
          source.includes("countdown") ||
          source.includes("timer") ||
          source.includes("downloadcountdown") ||
          source.includes("seconds")
        ) {
          nextDelay = Math.min(Number(delay) || 1, 25);
        }
      } catch {
        // keep original delay
      }
      return originalSetInterval.call(this, fn, nextDelay, ...rest);
    };
  } catch {
    // best effort
  }
}

function getControlText(element) {
  return String(element?.textContent || element?.value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isControlVisible(element) {
  if (!element || !element.isConnected) return false;
  try {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    const rect = element.getBoundingClientRect?.();
    if (rect && rect.width <= 0 && rect.height <= 0) return false;
  } catch {
    // fall through to ready check
  }
  return true;
}

function hasWaitText(text) {
  return (
    text.includes("wait") ||
    text.includes("preparing") ||
    text.includes("processing") ||
    /\b\d+\s*s\b/.test(text)
  );
}

function classifyDatanodesControl(element) {
  if (!isElementReadyForClick(element) || !isControlVisible(element)) {
    return null;
  }

  const text = getControlText(element);
  if (!text || text.includes("premium")) return null;

  if (text.includes("continue to download") || text === "continue") {
    return {
      element,
      kind: "continue",
      priority: 1,
      final: false,
      text,
    };
  }

  if (text.includes("free download")) {
    return {
      element,
      kind: "free_download",
      priority: 2,
      final: false,
      text,
    };
  }

  if (
    text.includes("start download") ||
    text.includes("download now") ||
    (text.includes("download") && !text.includes("free"))
  ) {
    if (hasWaitText(text)) return null;
    return {
      element,
      kind: "final_download",
      priority: 3,
      final: true,
      text,
    };
  }

  return null;
}

function nextFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 16);
  });
}

async function findBestDatanodesAction({ frameBudgetMs, isDone }) {
  const controls = Array.from(document.querySelectorAll("a, button, input"));
  let best = null;
  let frameStartedAt = performance.now();

  for (const control of controls) {
    if (isDone()) return null;

    const action = classifyDatanodesControl(control);
    if (action && (!best || action.priority < best.priority)) {
      best = action;
      if (best.priority === 1) break;
    }

    if (performance.now() - frameStartedAt >= frameBudgetMs) {
      await nextFrame();
      frameStartedAt = performance.now();
    }
  }

  return best;
}

export async function processDatanodesDownload({
  showToast,
  notifyMainFailure,
  reportAddonHealthy,
  settings = {},
}) {
  console.info("Starting datanodes.to opportunistic download flow...");

  patchDatanodesTimers();

  const timing = getDatanodesTiming(settings);
  const clickedAt = new WeakMap();
  let done = false;
  let running = false;
  let queued = false;
  let observer = null;
  let pollTimer = null;
  let timeoutTimer = null;

  const cleanup = () => {
    done = true;
    observer?.disconnect?.();
    observer = null;
    clearInterval(pollTimer);
    clearTimeout(timeoutTimer);
  };

  const isDone = () => done;

  async function clickAction(action) {
    const now = Date.now();
    const lastClickAt = clickedAt.get(action.element) || 0;
    if (now - lastClickAt < CLICK_COOLDOWN_MS) return;

    clickedAt.set(action.element, now);
    if (action.final) {
      action.element.setAttribute?.(CLICK_MARKER, "true");
    }

    if (!clickElement(action.element)) return;

    console.info("[Datanodes] Clicked action:", action.kind, action.text);

    if (!action.final) {
      return;
    }

    cleanup();
    showToast("Datanodes download triggered.");
    reportAddonHealthy();
  }

  async function runScan() {
    if (done) return;
    if (running) {
      queued = true;
      return;
    }

    running = true;
    try {
      do {
        queued = false;
        const action = await findBestDatanodesAction({
          frameBudgetMs: timing.scanFrameBudgetMs,
          isDone,
        });
        if (action) {
          await clickAction(action);
        }
      } while (queued && !done);
    } catch (error) {
      cleanup();
      await notifyMainFailure(
        HOST_LABEL,
        error?.message || "Datanodes automation failed.",
      );
    } finally {
      running = false;
    }
  }

  function scheduleScan() {
    if (done) return;
    void runScan();
  }

  timeoutTimer = setTimeout(() => {
    if (done) return;
    cleanup();
    void notifyMainFailure(
      HOST_LABEL,
      "Datanodes automation timed out. Please continue manually.",
      "timeout",
    );
  }, timing.totalFlowTimeout);

  observer = new MutationObserver(scheduleScan);
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "style", "class", "hidden", "value"],
    });
  }

  pollTimer = setInterval(
    scheduleScan,
    Math.max(100, timing.pollInterval || SCAN_POLL_INTERVAL_MS),
  );

  setTimeout(scheduleScan, 500);
  scheduleScan();
}
