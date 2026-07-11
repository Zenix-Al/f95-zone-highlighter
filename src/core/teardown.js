import { debugLog } from "./logger.js";
import { removeAllListeners } from "./listenerRegistry.js";
import { removeAllObserverCallbacks } from "./observer.js";
import { resourceManager } from "./resourceManager.js";
import { clearAllStyles } from "./styleRegistry.js";
import { listRegisteredFeatures } from "./featureCatalog.js";
import { abortCurrentRoute } from "./routeState.js";
import { resetRouteObserverForTests } from "./routeObserver.js";
import { notifyAllAddonsBeforePageChange } from "../services/addonsService.js";
import { clearBootstrapSummary } from "./bootstrap.js";

let runtimeState = "new";
let teardownPromise = null;

function runCleanup(summary, name, action) {
  try {
    action();
    summary.completed.push(name);
  } catch (error) {
    summary.failures.push({ name, message: error?.message || String(error) });
    debugLog("Teardown", `${name} failed: ${error}`, { level: "warn" });
  }
}

export function getRuntimeState() {
  return runtimeState;
}

export function markRuntimeRunning() {
  runtimeState = "running";
}

export function suspendRuntime(reason = "bfcache") {
  if (runtimeState === "stopped" || runtimeState === "stopping") return { state: runtimeState, reason };
  abortCurrentRoute(reason);
  runtimeState = "suspended";
  return { state: runtimeState, reason };
}

export function resumeRuntime() {
  runtimeState = "running";
  return runtimeState;
}

export async function teardownAll(reason = "unknown", { featureTimeoutMs = 1000 } = {}) {
  if (teardownPromise) return teardownPromise;
  runtimeState = "stopping";
  teardownPromise = (async () => {
    const summary = { reason, state: "stopped", disabledFeatures: [], completed: [], failures: [] };
    abortCurrentRoute(`teardown: ${reason}`);
    const disableWork = listRegisteredFeatures().map(async (feature) => {
      if (typeof feature?.disable !== "function") return;
      try {
        await Promise.race([
          feature.disable({ reason: "teardown" }),
          new Promise((resolve) => setTimeout(resolve, featureTimeoutMs)),
        ]);
        summary.disabledFeatures.push(feature.id || feature.name);
      } catch (error) {
        summary.failures.push({ name: feature.id || feature.name, message: error?.message || String(error) });
      }
    });
    await Promise.all(disableWork);
    runCleanup(summary, "addons", notifyAllAddonsBeforePageChange);
    runCleanup(summary, "routeObserver", resetRouteObserverForTests);
    runCleanup(summary, "observers", removeAllObserverCallbacks);
    runCleanup(summary, "listeners", removeAllListeners);
    runCleanup(summary, "resources", () => resourceManager.cleanupAll());
    runCleanup(summary, "styles", clearAllStyles);
    runCleanup(summary, "bootstrap", clearBootstrapSummary);
    runtimeState = "stopped";
    teardownPromise = null;
    return summary;
  })();
  return teardownPromise;
}

export function resetTeardownForTests() {
  teardownPromise = null;
  runtimeState = "new";
}
