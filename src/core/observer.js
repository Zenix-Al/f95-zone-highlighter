let observer = null;
import { safeExecute } from "./safeExecute.js";
import resourceManager from "./resourceManager.js";
import { debugLog } from "./logger.js";
const callbacks = new Map();

const OBSERVER_PROFILE_FLAG = "__F95UE_OBSERVER_PROFILE__";
const OBSERVER_PROFILE_STORAGE_KEY = "f95ue.observerProfile";
const OBSERVER_PROFILE_WINDOW_MS = 10000;
const OBSERVER_PROFILE_SLOW_TICK_MS = 16;
const OBSERVER_PROFILE_SLOW_CALLBACK_MS = 8;

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function getGlobalScope() {
  if (typeof globalThis !== "undefined") return globalThis;
  return null;
}

function isObserverProfilingEnabled() {
  const scope = getGlobalScope();
  if (!scope) return false;
  if (scope[OBSERVER_PROFILE_FLAG] === true) return true;
  try {
    return window.localStorage?.getItem(OBSERVER_PROFILE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function createObserverProfileState() {
  return {
    windowStartAt: nowMs(),
    ticks: 0,
    mutationsSeen: 0,
    callbacksRun: 0,
    callbacksFilteredOut: 0,
    totalTickMs: 0,
    maxTickMs: 0,
    slowTicks: 0,
    maxRegisteredCallbacks: 0,
    perCallback: new Map(),
  };
}

let observerProfileState = createObserverProfileState();

function resetObserverProfileState() {
  observerProfileState = createObserverProfileState();
}

function getOrCreateCallbackProfile(id) {
  let entry = observerProfileState.perCallback.get(id);
  if (!entry) {
    entry = {
      runs: 0,
      filteredOut: 0,
      totalMs: 0,
      maxMs: 0,
      slowRuns: 0,
    };
    observerProfileState.perCallback.set(id, entry);
  }
  return entry;
}

function maybeFlushObserverProfileWindow(now) {
  const elapsed = now - observerProfileState.windowStartAt;
  if (elapsed < OBSERVER_PROFILE_WINDOW_MS) return;

  const callbackSummary = {};
  for (const [id, stats] of observerProfileState.perCallback.entries()) {
    callbackSummary[id] = {
      runs: stats.runs,
      filteredOut: stats.filteredOut,
      avgMs: stats.runs > 0 ? Number((stats.totalMs / stats.runs).toFixed(3)) : 0,
      maxMs: Number(stats.maxMs.toFixed(3)),
      slowRuns: stats.slowRuns,
    };
  }

  const summary = {
    windowMs: Number(elapsed.toFixed(1)),
    ticks: observerProfileState.ticks,
    mutationsSeen: observerProfileState.mutationsSeen,
    callbacksRun: observerProfileState.callbacksRun,
    callbacksFilteredOut: observerProfileState.callbacksFilteredOut,
    avgTickMs:
      observerProfileState.ticks > 0
        ? Number((observerProfileState.totalTickMs / observerProfileState.ticks).toFixed(3))
        : 0,
    maxTickMs: Number(observerProfileState.maxTickMs.toFixed(3)),
    slowTicks: observerProfileState.slowTicks,
    maxRegisteredCallbacks: observerProfileState.maxRegisteredCallbacks,
    callbacks: callbackSummary,
  };

  const scope = getGlobalScope();
  if (scope) {
    scope.__F95UE_OBSERVER_PROFILE_LAST_SUMMARY__ = summary;
    const history = Array.isArray(scope.__F95UE_OBSERVER_PROFILE_HISTORY__)
      ? scope.__F95UE_OBSERVER_PROFILE_HISTORY__
      : [];
    history.push(summary);
    if (history.length > 20) history.shift();
    scope.__F95UE_OBSERVER_PROFILE_HISTORY__ = history;
  }

  if (isObserverProfilingEnabled()) {
    console.info("[F95UE ObserverProfiler] MutationObserver profile window summary", summary);
  }
  debugLog("ObserverProfiler", "MutationObserver profile window summary", { data: summary });
  resetObserverProfileState();
}

export function getObserverProfileSnapshot() {
  const callbackSummary = {};
  for (const [id, stats] of observerProfileState.perCallback.entries()) {
    callbackSummary[id] = {
      runs: stats.runs,
      filteredOut: stats.filteredOut,
      avgMs: stats.runs > 0 ? stats.totalMs / stats.runs : 0,
      maxMs: stats.maxMs,
      slowRuns: stats.slowRuns,
    };
  }
  return {
    windowStartAt: observerProfileState.windowStartAt,
    ticks: observerProfileState.ticks,
    mutationsSeen: observerProfileState.mutationsSeen,
    callbacksRun: observerProfileState.callbacksRun,
    callbacksFilteredOut: observerProfileState.callbacksFilteredOut,
    totalTickMs: observerProfileState.totalTickMs,
    maxTickMs: observerProfileState.maxTickMs,
    slowTicks: observerProfileState.slowTicks,
    maxRegisteredCallbacks: observerProfileState.maxRegisteredCallbacks,
    callbacks: callbackSummary,
  };
}

export function resetObserverProfileSnapshot() {
  resetObserverProfileState();
}

export function setObserverProfilingEnabled(enabled) {
  const scope = getGlobalScope();
  if (!scope) return false;
  const next = Boolean(enabled);
  scope[OBSERVER_PROFILE_FLAG] = next;
  try {
    if (next) {
      window.localStorage?.setItem(OBSERVER_PROFILE_STORAGE_KEY, "1");
    } else {
      window.localStorage?.removeItem(OBSERVER_PROFILE_STORAGE_KEY);
    }
  } catch {
    // ignore storage write failures
  }
  if (next) {
    resetObserverProfileState();
  }
  return true;
}

/**
 * The main callback that runs when the MutationObserver detects changes.
 * It iterates over all registered feature callbacks.
 * @param {MutationRecord[]} mutationsList
 * @param {MutationObserver} obs
 */
function masterCallback(mutationsList, obs) {
  const profiling = isObserverProfilingEnabled();
  const tickStart = profiling ? nowMs() : 0;

  if (profiling) {
    observerProfileState.ticks += 1;
    observerProfileState.mutationsSeen += mutationsList.length;
    observerProfileState.maxRegisteredCallbacks = Math.max(
      observerProfileState.maxRegisteredCallbacks,
      callbacks.size,
    );
  }

  for (const [id, { callback, filter }] of callbacks.entries()) {
    let callbackStats = null;
    if (profiling) {
      callbackStats = getOrCreateCallbackProfile(id);
    }

    if (typeof filter === "function") {
      const shouldRun = safeExecute(filter, null, mutationsList, obs);
      if (!shouldRun) {
        if (profiling) {
          observerProfileState.callbacksFilteredOut += 1;
          callbackStats.filteredOut += 1;
        }
        continue;
      }
    }

    const callbackStart = profiling ? nowMs() : 0;
    safeExecute(callback, null, mutationsList, obs);

    if (profiling) {
      const callbackDuration = nowMs() - callbackStart;
      observerProfileState.callbacksRun += 1;
      callbackStats.runs += 1;
      callbackStats.totalMs += callbackDuration;
      callbackStats.maxMs = Math.max(callbackStats.maxMs, callbackDuration);
      if (callbackDuration >= OBSERVER_PROFILE_SLOW_CALLBACK_MS) {
        callbackStats.slowRuns += 1;
      }
    }
  }

  if (profiling) {
    const tickDuration = nowMs() - tickStart;
    observerProfileState.totalTickMs += tickDuration;
    observerProfileState.maxTickMs = Math.max(observerProfileState.maxTickMs, tickDuration);
    if (tickDuration >= OBSERVER_PROFILE_SLOW_TICK_MS) {
      observerProfileState.slowTicks += 1;
      if (isObserverProfilingEnabled()) {
        console.warn(`[F95UE ObserverProfiler] Slow MutationObserver tick: ${tickDuration.toFixed(2)}ms`);
      }
      debugLog("ObserverProfiler", `Slow MutationObserver tick: ${tickDuration.toFixed(2)}ms`, {
        level: "warn",
      });
    }
    maybeFlushObserverProfileWindow(nowMs());
  }
}

/**
 * Starts the shared MutationObserver if it's not already running.
 */
function startObserver() {
  if (observer) return; // Already running

  observer = new MutationObserver(masterCallback);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Stops the shared MutationObserver if no callbacks are registered.
 */
function stopObserver() {
  if (observer && callbacks.size === 0) {
    observer.disconnect();
    observer = null;
    if (isObserverProfilingEnabled()) {
      maybeFlushObserverProfileWindow(nowMs());
    }
  }
}

export function addObserverCallback(id, callback, options = {}) {
  if (callbacks.has(id)) return;
  callbacks.set(id, {
    callback,
    filter: typeof options.filter === "function" ? options.filter : null,
  });
  resourceManager.register(`observer:${id}`, () => removeObserverCallback(id));
  startObserver();
}

export function removeObserverCallback(id) {
  callbacks.delete(id);
  resourceManager.unregister(`observer:${id}`);
  stopObserver();
}

export function removeAllObserverCallbacks() {
  for (const id of Array.from(callbacks.keys())) {
    callbacks.delete(id);
    resourceManager.unregister(`observer:${id}`);
  }
  stopObserver();
  if (isObserverProfilingEnabled()) {
    maybeFlushObserverProfileWindow(nowMs());
  }
}
