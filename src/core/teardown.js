import { debugLog } from "./logger.js";
import { removeAllListeners } from "./listenerRegistry.js";
import { removeAllObserverCallbacks } from "./observer.js";
import resourceManager from "./resourceManager.js";
import { clearAllStyles } from "./styleRegistry.js";

let teardownInProgress = false;

export function teardownAll(reason = "unknown") {
  if (teardownInProgress) return;
  teardownInProgress = true;

  debugLog("Teardown", `Starting global teardown (${reason})`);

  try {
    removeAllObserverCallbacks();
  } catch (err) {
    debugLog("Teardown", `Observer teardown failed: ${err}`, { level: "warn" });
  }

  try {
    removeAllListeners();
  } catch (err) {
    debugLog("Teardown", `Listener teardown failed: ${err}`, { level: "warn" });
  }

  try {
    resourceManager.cleanupAll();
  } catch (err) {
    debugLog("Teardown", `Resource cleanup failed: ${err}`, { level: "warn" });
  }

  try {
    clearAllStyles();
  } catch (err) {
    debugLog("Teardown", `Style cleanup failed: ${err}`, { level: "warn" });
  }
}

