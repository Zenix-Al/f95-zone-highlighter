import { debugLog } from "./logger.js";
import { removeAllListeners } from "./listenerRegistry.js";
import { removeAllObserverCallbacks } from "./observer.js";
import { resourceManager } from "./resourceManager.js";
import { clearAllStyles } from "./styleRegistry.js";
import { listRegisteredFeatures } from "./featureCatalog.js";
import { abortCurrentRoute } from "./routeState.js";
import { resetRouteObserverForTests } from "./routeObserver.js";
import { abortActiveBootstrap, clearBootstrapSummary } from "./bootstrap.js";
import { disposeAllTaskQueues, pauseAllTaskQueues, resumeAllTaskQueues } from "./taskQueue.js";
import { resetGlobalErrorListeners } from "./featureFactory.js";
import { redactDiagnosticValue, reportFeatureWarning } from "./featureHealth.js";
import { shutdownAddonsService } from "../services/addonsService.js";

let runtimeState = "new";
let teardownPromise = null;
let lastTeardownSummary = null;
const resetters = new Set();

function cloneSummary(summary) {
  return summary ? JSON.parse(JSON.stringify(summary)) : null;
}

function reportTeardownFailure(name, error, phase = "teardown.cleanup") {
  const message = redactDiagnosticValue(error?.message || String(error || "Unknown teardown error"));
  reportFeatureWarning("Teardown", message, phase, { details: { resource: String(name || "unknown") } });
  debugLog("Teardown", `${name} failed: ${message}`, { level: "warn" });
  return message;
}

function runCleanup(summary, name, action) {
  try {
    action();
    summary.completed.push(name);
  } catch (error) {
    summary.failures.push({ name, message: reportTeardownFailure(name, error) });
  }
}

async function disableFeatures(summary, featureTimeoutMs) {
  const work = listRegisteredFeatures().map(async (feature) => {
    if (typeof feature?.disable !== "function") return;
    const name = feature.id || feature.name || "unknown-feature";
    let timeoutId;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => feature.disable({ reason: "teardown" })),
        new Promise((resolve) => {
          timeoutId = setTimeout(() => resolve({ timedOut: true }), Math.max(0, Number(featureTimeoutMs) || 0));
        }),
      ]);
      if (result?.timedOut) {
        summary.failures.push({ name, code: "timeout", message: "Feature disable timed out" });
        reportFeatureWarning("Teardown", "Feature disable timed out", "teardown.feature-timeout", {
          details: { featureId: name, timeoutMs: featureTimeoutMs },
        });
      } else {
        summary.disabledFeatures.push(name);
      }
    } catch (error) {
      summary.failures.push({ name, message: reportTeardownFailure(name, error, "teardown.feature-disable") });
    } finally {
      clearTimeout(timeoutId);
    }
  });
  await Promise.all(work);
}

export function registerTeardownResetter(reset) {
  if (typeof reset !== "function") return () => {};
  resetters.add(reset);
  return () => resetters.delete(reset);
}

export function getRuntimeState() {
  return runtimeState;
}

export function markRuntimeStarting() {
  if (runtimeState === "new" || runtimeState === "stopped") {
    runtimeState = "starting";
    lastTeardownSummary = null;
  }
  return runtimeState;
}

export function markRuntimeRunning() {
  if (runtimeState !== "stopped" && runtimeState !== "suspended") runtimeState = "running";
  return runtimeState;
}

export function suspendRuntime(reason = "bfcache") {
  if (runtimeState === "stopped" || runtimeState === "stopping") return { state: runtimeState, reason };
  abortCurrentRoute(reason);
  const queues = pauseAllTaskQueues(reason);
  runtimeState = "suspended";
  return { state: runtimeState, reason, queues };
}

export function resumeRuntime(routeContext = null) {
  if (runtimeState === "stopped" || runtimeState === "stopping") return runtimeState;
  resumeAllTaskQueues(routeContext);
  runtimeState = "running";
  return runtimeState;
}

export async function teardownAll(reason = "unknown", { featureTimeoutMs = 1000 } = {}) {
  if (teardownPromise) return teardownPromise;
  if (runtimeState === "stopped" && lastTeardownSummary) return cloneSummary(lastTeardownSummary);

  runtimeState = "stopping";
  teardownPromise = (async () => {
    const summary = {
      reason,
      state: "stopped",
      disabledFeatures: [],
      completed: [],
      failures: [],
    };

    abortActiveBootstrap(`teardown: ${reason}`);
    abortCurrentRoute(`teardown: ${reason}`);
    try {
      await disposeAllTaskQueues(`teardown: ${reason}`);
      summary.completed.push("taskQueues");
    } catch (error) {
      summary.failures.push({ name: "taskQueues", message: reportTeardownFailure("taskQueues", error) });
    }

    await disableFeatures(summary, featureTimeoutMs);
    runCleanup(summary, "addons", () => shutdownAddonsService(`teardown: ${reason}`));
    runCleanup(summary, "routeObserver", resetRouteObserverForTests);
    runCleanup(summary, "observers", removeAllObserverCallbacks);
    runCleanup(summary, "listeners", removeAllListeners);
    runCleanup(summary, "resources", () => resourceManager.cleanupAll());
    runCleanup(summary, "styles", clearAllStyles);
    runCleanup(summary, "globalErrorListeners", resetGlobalErrorListeners);
    runCleanup(summary, "bootstrap", clearBootstrapSummary);

    for (const reset of resetters) {
      try {
        reset();
        summary.completed.push("initialization");
      } catch (error) {
        summary.failures.push({ name: "initialization", message: reportTeardownFailure("initialization", error) });
      }
    }

    runtimeState = "stopped";
    lastTeardownSummary = summary;
    return summary;
  })();

  try {
    return await teardownPromise;
  } finally {
    teardownPromise = null;
  }
}

export function resetTeardownForTests() {
  teardownPromise = null;
  lastTeardownSummary = null;
  runtimeState = "new";
}
