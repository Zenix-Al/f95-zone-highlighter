import { debugLog } from "./logger.js";
import stateManager, { config } from "../config.js";
import { setFeatureStatus, pushRuntimeError } from "./featureHealth.js";
import { showToast } from "../ui/components/toast.js";
import { getByPath } from "../utils/objectPath.js";

// Capture uncaught errors / unhandled rejections once per session so the
// health diagnostic can surface runtime failures that happen outside the
// feature lifecycle (e.g. inside requestAnimationFrame / queueMicrotask).
let _globalListenerRegistered = false;
function ensureGlobalListeners() {
  if (_globalListenerRegistered) return;
  _globalListenerRegistered = true;

  window.addEventListener("error", (event) => {
    const msg = event?.message ? String(event.message) : "Unknown error";
    pushRuntimeError(msg);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    const msg = reason?.message ? String(reason.message) : String(reason ?? "Unknown rejection");
    pushRuntimeError(`Unhandled: ${msg}`);
  });
}
ensureGlobalListeners();

const OP_TIMEOUT = 15000;

function isPromiseLike(value) {
  return Boolean(value) && typeof value.then === "function";
}

function getErrorMessage(err) {
  return err?.message || String(err);
}

function reportLifecycleFailure(name, action, err) {
  const message = getErrorMessage(err);
  setFeatureStatus(name, "failing", message);
  try {
    showToast(`${name} failed to ${action}: ${message}`);
  } catch {}
}

/**
 * Creates a standardized feature module interface. This factory is designed to
 * ensure all features follow a consistent lifecycle (enable, disable, toggle)
 * and have a uniform way of checking if they are enabled via configuration.
 */
export const createFeature = (
  name,
  { enable, disable, configPath, isEnabled: customIsEnabled, isApplicable },
) => {
  let opInProgress = false;
  let pendingDesired = null;

  function canRunOnCurrentPage() {
    if (typeof isApplicable !== "function") return true;
    try {
      return Boolean(isApplicable({ stateManager, config }));
    } catch (err) {
      debugLog(name, `Applicability check failed: ${err?.message || String(err)}`);
      return false;
    }
  }

  function computeIdleStatus() {
    const desired = feature.isEnabled();
    if (!desired) return { status: "disabled", details: null };
    if (!canRunOnCurrentPage()) {
      return { status: "disabled", details: "page mismatch" };
    }
    return { status: "unknown", details: null };
  }

  function queueDesiredState(action) {
    pendingDesired = action;
    debugLog(name, `${action === "enable" ? "Enable" : "Disable"} deferred — operation in progress.`);
  }

  function finalizeTransition(action, timer, finished) {
    finished.value = true;
    clearTimeout(timer);
    opInProgress = false;

    const nextDesired = pendingDesired;
    pendingDesired = null;
    if (nextDesired && nextDesired !== action) {
      feature[nextDesired]();
    }
  }

  function runTransition(action, handler, successStatus, timeoutDetails) {
    opInProgress = true;
    pendingDesired = null;

    const finished = { value: false };
    const timer = setTimeout(() => {
      if (!finished.value) {
        debugLog(name, `${action === "enable" ? "Enable" : "Disable"} operation timed out — marking as failing.`);
        setFeatureStatus(name, "failing", timeoutDetails);
        opInProgress = false;
      }
    }, OP_TIMEOUT);

    async function executeTransition() {
      try {
        const result = handler ? handler() : null;
        if (isPromiseLike(result)) await result;
        setFeatureStatus(name, successStatus);
      } catch (err) {
        reportLifecycleFailure(name, action, err);
      } finally {
        finalizeTransition(action, timer, finished);
      }
    }

    void executeTransition();
  }

  const feature = {
    name: name,
    enable: function () {
      debugLog(name, "Enable requested");
      if (!canRunOnCurrentPage()) {
        debugLog(name, "Enable skipped - page mismatch.");
        setFeatureStatus(name, "disabled", "page mismatch");
        return;
      }

      if (opInProgress) {
        queueDesiredState("enable");
        return;
      }

      runTransition("enable", enable, "running", "enable timeout");
    },
    disable: function () {
      debugLog(name, "Disable requested");
      if (opInProgress) {
        queueDesiredState("disable");
        return;
      }

      runTransition("disable", disable, "disabled", "disable timeout");
    },
    toggle: function (shouldEnable, force = false) {
      if (force) {
        // Forced toggle: clear any pending and try to interrupt by cleanup where possible
        pendingDesired = null;
        // best-effort: if op in progress, mark as failing and continue
        if (opInProgress) {
          debugLog(name, "Forced toggle requested while operation in progress.");
        }
      }
      shouldEnable ? this.enable() : this.disable();
    },
    sync: function (force = false) {
      this.toggle(this.isEnabled(), force);
    },
    isEnabled: function () {
      if (customIsEnabled) return customIsEnabled();
      if (!configPath) return true;
      const value = getByPath(config, configPath);
      return typeof value === "boolean" ? value : false;
    },
    isApplicable: function () {
      return canRunOnCurrentPage();
    },
    /**
     * Feature code running AFTER enable() can call this to record a runtime
     * error and update health status without going through the lifecycle.
     * e.g.  latestOverlayFeature.reportError(err, "processTilesBatch")
     */
    reportError: function (err, phase = "runtime") {
      const message = err?.message || String(err);
      debugLog(name, `Runtime error [${phase}]: ${message}`);
      setFeatureStatus(name, "failing", `[${phase}] ${message}`);
      try {
        showToast(`${name} error: ${message}`);
      } catch {}
    },
  };

  try {
    const initial = computeIdleStatus();
    setFeatureStatus(name, initial.status, initial.details);
  } catch {
    setFeatureStatus(name, "unknown");
  }

  return feature;
};
