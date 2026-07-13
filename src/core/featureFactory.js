import { debugLog } from "./logger.js";
import { stateManager, config } from "../config.js";
import {
  setFeatureStatus,
  reportFeatureFailure,
  reportRuntimeError,
} from "./featureHealth.js";
import { showToast } from "../ui/components/toast.js";
import { getByPath } from "../utils/objectPath.js";
import { addListener } from "./listenerRegistry.js";

let globalListenerRegistered = false;
export function initGlobalErrorListeners() {
  if (globalListenerRegistered) return;
  globalListenerRegistered = true;

  addListener("global-error", window, "error", (event) => {
    reportRuntimeError(event?.error || event?.message || "Unknown error", "window.error");
  }, undefined, "core:runtime");
  addListener("global-unhandledrejection", window, "unhandledrejection", (event) => {
    reportRuntimeError(event?.reason ?? "Unknown rejection", "unhandledrejection");
  }, undefined, "core:runtime");
}

export function resetGlobalErrorListeners() {
  globalListenerRegistered = false;
}

const OP_TIMEOUT = 15000;
const ABORT_GRACE_MS = 250;
const FEATURE_BOOTSTRAP_MODES = new Set(["waitForBody", "fast"]);
const LIFECYCLE_REASONS = new Set(["startup", "config-change", "route-change", "teardown", "retry"]);

function getErrorMessage(error) {
  return error?.message || String(error);
}

function createAbortError(message = "operation aborted") {
  return Object.assign(new Error(message), { name: "AbortError" });
}

function isAbortError(error) {
  return error?.name === "AbortError" || /aborted|abort/i.test(getErrorMessage(error));
}

function waitForAbortGrace(promise) {
  return Promise.race([
    Promise.resolve(promise).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, ABORT_GRACE_MS)),
  ]);
}

function reportLifecycleFailure(featureId, name, action, error, context = {}) {
  const message = getErrorMessage(error);
  debugLog(featureId, "Lifecycle transition failed", {
    data: { action, error: message },
    level: "error",
  });
  reportFeatureFailure(name, error, action, context);
  try {
    showToast(`${name} failed to ${action}: ${message}`);
  } catch {}
}

export function createLifecycleContext(featureId, action, {
  generation = 0,
  routeGeneration = 0,
  correlationId = "",
  reason = "startup",
  routeSignal = null,
} = {}) {
  const controller = new AbortController();
  if (routeSignal?.aborted) controller.abort(routeSignal.reason);
  else routeSignal?.addEventListener("abort", () => controller.abort(routeSignal.reason), { once: true });
  return {
    signal: controller.signal,
    operationId: `${featureId}:${action}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
    correlationId: String(correlationId || ""),
    generation,
    routeGeneration,
    reason: LIFECYCLE_REASONS.has(reason) ? reason : "startup",
    featureId,
    action,
    abort: (abortReason) => controller.abort(abortReason),
  };
}

function slugifyFeatureKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveFeatureId(name, explicitId = "", settingsUi = null) {
  return slugifyFeatureKey(explicitId) || slugifyFeatureKey(settingsUi?.id) || slugifyFeatureKey(name) || "unnamed-feature";
}

// This remains lenient for callers which only need a safe display default.
// Registration validates _declaredBootstrapMode so malformed declarations are never accepted.
export function normalizeFeatureBootstrapMode(value) {
  return FEATURE_BOOTSTRAP_MODES.has(value) ? value : "waitForBody";
}

/** Create a cancellable, awaitable feature lifecycle wrapper. */
export function createFeature(name, {
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
} = {}) {
  let lifecycleGeneration = 0;
  let activeOperation = null;
  let pendingTransition = null;
  let transitionChain = Promise.resolve();
  const featureId = resolveFeatureId(name, id, settingsUi);

  function canRunOnCurrentPage() {
    if (typeof isApplicable !== "function") return true;
    try {
      return Boolean(isApplicable({ stateManager, config }));
    } catch (error) {
      debugLog(featureId, "Applicability check failed", {
        data: { error: getErrorMessage(error) },
        level: "warn",
      });
      return false;
    }
  }

  function createOperationContext(action, suppliedContext) {
    lifecycleGeneration += 1;
    return createLifecycleContext(featureId, action, {
      generation: lifecycleGeneration,
      routeGeneration: Number(suppliedContext?.routeGeneration) || 0,
      correlationId: suppliedContext?.correlationId,
      reason: suppliedContext?.reason,
      routeSignal: suppliedContext?.signal,
    });
  }

  function requestTransition(action, suppliedContext = null) {
    const transition = { action, suppliedContext };
    pendingTransition = transition;
    if (activeOperation) activeOperation.context.abort(createAbortError("operation superseded"));

    const queued = transitionChain.catch(() => undefined).then(async () => {
      if (pendingTransition !== transition) throw createAbortError("operation superseded");
      pendingTransition = null;

      const previous = activeOperation;
      if (previous) {
        previous.context.abort(createAbortError("operation superseded"));
        await waitForAbortGrace(previous.settled);
      }

      const context = createOperationContext(action, suppliedContext);
      const operation = { action, context, settled: null };
      activeOperation = operation;
      const handler = action === "enable" ? enable : disable;
      const successStatus = action === "enable" ? "running" : "disabled";
      let timeoutId;
      const handlerResult = Promise.resolve().then(() => (handler ? handler(context) : null));
      handlerResult.catch(() => undefined);
      const timeoutResult = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          context.abort(createAbortError(`${action} timeout`));
          reject(createAbortError(`${action} timeout`));
        }, OP_TIMEOUT);
      });
      operation.settled = Promise.race([handlerResult, timeoutResult]);

      try {
        await operation.settled;
        if (context.signal.aborted || activeOperation !== operation) throw createAbortError();
        setFeatureStatus(name, successStatus);
        return true;
      } catch (error) {
        if (isAbortError(error) || context.signal.aborted) {
          if (activeOperation === operation) setFeatureStatus(name, "disabled", "cancelled");
          throw createAbortError(getErrorMessage(error));
        }
        reportLifecycleFailure(featureId, name, action, error, context);
        throw error;
      } finally {
        clearTimeout(timeoutId);
        if (activeOperation === operation) activeOperation = null;
      }
    });
    transitionChain = queued;
    return queued;
  }

  const feature = {
    id: featureId,
    featureKey: featureId,
    name,
    bootstrapMode: normalizeFeatureBootstrapMode(bootstrapMode),
    _declaredBootstrapMode: bootstrapMode,
    fastCapture,
    pageScopes: Array.isArray(pageScopes) ? pageScopes.map((scope) => String(scope || "").trim()).filter(Boolean) : pageScopes,
    settingsUi: settingsUi && typeof settingsUi === "object" ? settingsUi : null,
    enable(context = null) {
      if (!canRunOnCurrentPage()) {
        setFeatureStatus(name, "disabled", "page mismatch");
        return Promise.resolve(false);
      }
      return requestTransition("enable", context);
    },
    disable(context = null) {
      return requestTransition("disable", context);
    },
    toggle(shouldEnable, force = false) {
      if (force) pendingTransition = null;
      return shouldEnable ? this.enable() : this.disable();
    },
    sync(force = false) {
      return this.toggle(this.isEnabled(), force);
    },
    isEnabled() {
      if (customIsEnabled) return customIsEnabled();
      if (!configPath) return true;
      return getByPath(config, configPath) === true;
    },
    isApplicable() {
      return canRunOnCurrentPage();
    },
    reportError(error, phase = "runtime") {
      const message = getErrorMessage(error);
      debugLog(featureId, "Runtime error", { data: { phase, error: message }, level: "error" });
      reportFeatureFailure(name, error, phase);
      try {
        showToast(`${name} error: ${message}`);
      } catch {}
    },
  };

  const desired = feature.isEnabled();
  setFeatureStatus(name, desired && canRunOnCurrentPage() ? "unknown" : "disabled", desired ? "page mismatch" : null);
  return feature;
}
