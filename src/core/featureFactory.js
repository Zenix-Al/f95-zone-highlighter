import { debugLog } from "./logger.js";
import { config } from "../config.js";
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

/**
 * Creates a standardized feature module interface. This factory is designed to
 * ensure all features follow a consistent lifecycle (enable, disable, toggle)
 * and have a uniform way of checking if they are enabled via configuration.
 */
export const createFeature = (
  name,
  { enable, disable, configPath, isEnabled: customIsEnabled },
) => {
  // Internal operation state to serialize toggles and coalesce rapid requests
  let opInProgress = false;
  let pendingDesired = null; // 'enable' | 'disable' | null
  const OP_TIMEOUT = 15000; // ms - fail-safe to avoid hangs

  const feature = {
    name: name,
    enable: function () {
      // Serialize enable requests: if an operation is running, remember desired state and return
      debugLog(name, "Enable requested");
      if (opInProgress) {
        pendingDesired = "enable";
        debugLog(name, "Enable deferred — operation in progress.");
        return;
      }

      opInProgress = true;
      pendingDesired = null;
      let finished = false;
      const timer = setTimeout(() => {
        if (!finished) {
          debugLog(name, "Enable operation timed out — marking as failing.");
          setFeatureStatus(name, "failing", "enable timeout");
          opInProgress = false;
        }
      }, OP_TIMEOUT);

      (async () => {
        try {
          const res = enable ? enable() : null;
          if (res && typeof res.then === "function") await res;
          setFeatureStatus(name, "running");
        } catch (err) {
          setFeatureStatus(name, "failing", err?.message || String(err));
          try {
            showToast(`${name} failed to enable: ${err?.message || String(err)}`);
          } catch {}
        } finally {
          finished = true;
          clearTimeout(timer);
          opInProgress = false;
          // If the user changed their mind while we were operating, honor it now
          if (pendingDesired === "disable") feature.disable();
          pendingDesired = null;
        }
      })();
    },
    disable: function () {
      debugLog(name, "Disable requested");
      if (opInProgress) {
        pendingDesired = "disable";
        debugLog(name, "Disable deferred — operation in progress.");
        return;
      }

      opInProgress = true;
      pendingDesired = null;
      let finished = false;
      const timer = setTimeout(() => {
        if (!finished) {
          debugLog(name, "Disable operation timed out — marking as failing.");
          setFeatureStatus(name, "failing", "disable timeout");
          opInProgress = false;
        }
      }, OP_TIMEOUT);

      (async () => {
        try {
          const res = disable ? disable() : null;
          if (res && typeof res.then === "function") await res;
          setFeatureStatus(name, "disabled");
        } catch (err) {
          setFeatureStatus(name, "failing", err?.message || String(err));
          try {
            showToast(`${name} failed to disable: ${err?.message || String(err)}`);
          } catch {}
        } finally {
          finished = true;
          clearTimeout(timer);
          opInProgress = false;
          if (pendingDesired === "enable") feature.enable();
          pendingDesired = null;
        }
      })();
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
    isEnabled: function () {
      if (customIsEnabled) return customIsEnabled();
      if (!configPath) return true;
      const value = getByPath(config, configPath);
      return typeof value === "boolean" ? value : false;
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
    const desired = feature.isEnabled();
    setFeatureStatus(name, desired ? "unknown" : "disabled");
  } catch {
    setFeatureStatus(name, "unknown");
  }

  return feature;
};
