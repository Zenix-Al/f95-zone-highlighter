import { debugLog } from "./logger.js";
import { stateManager, config } from "../config.js";
import {
  setFeatureStatus,
  reportFeatureFailure,
  reportRuntimeError,
} from "./featureHealth.js";
import { showToast } from "../ui/components/toast.js";
import { getByPath } from "../utils/objectPath.js";

// Capture uncaught errors / unhandled rejections once per session so the
// health diagnostic can surface runtime failures that happen outside the
// feature lifecycle (e.g. inside requestAnimationFrame / queueMicrotask).
let _globalListenerRegistered = false;
export function initGlobalErrorListeners() {
  if (_globalListenerRegistered) return;
  _globalListenerRegistered = true;

  window.addEventListener("error", (event) => {
    reportRuntimeError(event?.error || event?.message || "Unknown error", "window.error");
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportRuntimeError(event?.reason ?? "Unknown rejection", "unhandledrejection");
  });
}

const OP_TIMEOUT = 15000;
const FEATURE_BOOTSTRAP_MODES = new Set(["waitForBody", "fast"]);
const FAST_CAPTURE_TRANSPORTS = new Set(["xhr", "fetch", "any"]);
const FAST_CAPTURE_MODES = new Set(["latest", "oncePerRoute", "oncePerDocument"]);

function isPromiseLike(value) {
  return Boolean(value) && typeof value.then === "function";
}

function getErrorMessage(err) {
  return err?.message || String(err);
}

function reportLifecycleFailure(featureId, name, action, err) {
  const message = getErrorMessage(err);
  debugLog(featureId, "Lifecycle transition failed", {
    data: { action, error: message },
    level: "error",
  });
  reportFeatureFailure(name, err, action);
  try {
    showToast(`${name} failed to ${action}: ${message}`);
  } catch {}
}

function slugifyFeatureKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveFeatureId(name, explicitId = "", settingsUi = null) {
  const explicit = slugifyFeatureKey(explicitId);
  if (explicit) return explicit;

  const settingsId = slugifyFeatureKey(settingsUi?.id);
  if (settingsId) return settingsId;

  return slugifyFeatureKey(name) || "unnamed-feature";
}

export function normalizeFeatureBootstrapMode(value) {
  return FEATURE_BOOTSTRAP_MODES.has(value) ? value : "waitForBody";
}

function normalizeFastCaptureUrlIncludes(value) {
  const entries = Array.isArray(value) ? value : [value];
  const normalized = entries.map((entry) => String(entry || "").trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : [];
}

export function normalizeFastCaptureConfig(value) {
  if (!value || typeof value !== "object") return null;

  const urlIncludes = normalizeFastCaptureUrlIncludes(value.urlIncludes);
  const dataPath = String(value.dataPath || "").trim();
  if (urlIncludes.length === 0 || !dataPath) return null;

  const transport = FAST_CAPTURE_TRANSPORTS.has(value.transport) ? value.transport : "any";
  const legacyMode = value.once === false ? "latest" : "oncePerDocument";
  const mode = FAST_CAPTURE_MODES.has(value.mode) ? value.mode : legacyMode;

  return {
    urlIncludes,
    dataPath,
    transport,
    mode,
    ttlMs: Math.max(0, Number(value.ttlMs) || 0),
  };
}

/**
 * Creates a standardized feature module interface. This factory is designed to
 * ensure all features follow a consistent lifecycle (enable, disable, toggle)
 * and have a uniform way of checking if they are enabled via configuration.
 */
export function createFeature(
  name,
  {
    id,
    enable,
    disable,
    configPath,
    isEnabled: customIsEnabled,
    isApplicable,
    settingsUi = null,
    bootstrapMode = "waitForBody",
    fastCapture = null,
    pageScopes = [],
  },
) {
  let opInProgress = false;
  let pendingDesired = null;
  const featureId = resolveFeatureId(name, id, settingsUi);
  const normalizedBootstrapMode = normalizeFeatureBootstrapMode(bootstrapMode);
  const normalizedFastCapture = normalizeFastCaptureConfig(fastCapture);

  function canRunOnCurrentPage() {
    if (typeof isApplicable !== "function") return true;
    try {
      return Boolean(isApplicable({ stateManager, config }));
    } catch (err) {
      debugLog(featureId, "Applicability check failed", {
        data: { error: err?.message || String(err) },
        level: "warn",
      });
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
    debugLog(
      featureId,
      `${action === "enable" ? "Enable" : "Disable"} deferred — operation in progress.`,
    );
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
        debugLog(
          featureId,
          `${action === "enable" ? "Enable" : "Disable"} operation timed out — marking as failing.`,
        );
        reportFeatureFailure(name, timeoutDetails, action);
        opInProgress = false;
      }
    }, OP_TIMEOUT);

    async function executeTransition() {
      try {
        const result = handler ? handler() : null;
        if (isPromiseLike(result)) await result;
        setFeatureStatus(name, successStatus);
      } catch (err) {
        reportLifecycleFailure(featureId, name, action, err);
      } finally {
        finalizeTransition(action, timer, finished);
      }
    }

    void executeTransition();
  }

  const feature = {
    id: featureId,
    featureKey: featureId,
    name: name,
    bootstrapMode: normalizedBootstrapMode,
    fastCapture: normalizedFastCapture,
    pageScopes: Array.isArray(pageScopes)
      ? pageScopes.map((scope) => String(scope || "").trim()).filter(Boolean)
      : [],
    settingsUi: settingsUi && typeof settingsUi === "object" ? settingsUi : null,
    enable: function () {
      debugLog(featureId, "Enable requested");
      if (!canRunOnCurrentPage()) {
        debugLog(featureId, "Enable skipped - page mismatch.");
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
      debugLog(featureId, "Disable requested");
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
          debugLog(featureId, "Forced toggle requested while operation in progress.");
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
      debugLog(featureId, "Runtime error", {
        data: { phase, error: message },
        level: "error",
      });
      reportFeatureFailure(name, err, phase);
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
}
