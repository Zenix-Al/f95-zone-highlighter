import { CONFIG_SCHEMA_VERSION } from "../config/persistence.js";
import {
  recordHealthEvent,
  registerDiagnosticsProvider,
  setFeatureStatus,
} from "../core/featureHealth.js";
import { loadConfig, retryLoadData } from "./settingsService.js";
import { storageAdapter } from "./storageAdapter.js";
import {
  getStorageReadinessSnapshot,
  isTerminalStorageState,
  publishStorageReadiness,
  resetStorageReadinessForTests,
} from "./storageReadiness.js";

let activePromise = null;
let attempt = 0;

function publish(next) {
  return publishStorageReadiness(next);
}

function recordStorageHealth(code, severity, message, details = {}) {
  recordHealthEvent({
    code: `CONFIG_STORAGE_${code}`,
    severity,
    ownerId: "Storage",
    subsystem: "storage",
    message,
    details,
  });
}

function classifyLoadResult(loaded, context) {
  if (loaded?.status === "upgrade-required") {
    const blocked = publish({
      ...context,
      state: "upgrade-required",
      source: String(loaded.source || "legacy-surface"),
      schemaVersion: null,
      usingFallback: true,
      requiresUpgrade: true,
      reason: "legacy_surface",
      settledAt: Date.now(),
    });
    setFeatureStatus("Storage", "failing", "upgrade required");
    recordStorageHealth("UPGRADE_REQUIRED", "error", "Stored configuration requires the supported bridge release.", {
      state: blocked.state,
      source: blocked.source,
      reason: blocked.reason,
      attempt: blocked.attempt,
    });
    throw Object.assign(new Error("upgrade_required"), {
      code: "upgrade_required",
      storageSnapshot: blocked,
    });
  }
  const degraded = loaded?.persisted === false;
  const next = publish({
    ...context,
    state: degraded ? "degraded-readonly" : "ready",
    source: String(loaded?.source || "unknown"),
    schemaVersion: Number.isInteger(loaded?.envelope?.schemaVersion)
      ? loaded.envelope.schemaVersion
      : degraded ? null : CONFIG_SCHEMA_VERSION,
    usingFallback: Boolean(loaded?.recovered || degraded),
    reason: degraded ? String(loaded?.status || "configuration_not_persisted") : "",
    settledAt: Date.now(),
  });
  if (degraded) {
    setFeatureStatus("Storage", "degraded", next.reason);
    recordStorageHealth("DEGRADED", "warning", "Configuration loaded without verified writable persistence.", {
      state: next.state,
      source: next.source,
      reason: next.reason,
      attempt: next.attempt,
    });
  } else {
    setFeatureStatus("Storage", "running", "ready");
  }
  return next;
}

async function executeBootstrap({ force = false } = {}) {
  attempt += 1;
  const startedAt = Date.now();
  publish({ state: "probing", startedAt, attempt });
  const probe = await storageAdapter.probe();
  const context = {
    startedAt,
    attempt,
    manager: probe.manager,
    canRead: probe.canRead,
    canWrite: probe.canWrite,
    canDelete: probe.canDelete,
    failedStep: probe.failedStep,
  };
  if (!probe.ok) {
    const unavailable = publish({
      ...context,
      state: "unavailable",
      reason: probe.reason || "storage_probe_failed",
      settledAt: Date.now(),
    });
    setFeatureStatus("Storage", "failing", unavailable.reason);
    recordStorageHealth("UNAVAILABLE", "error", "Userscript storage capability verification failed.", {
      manager: unavailable.manager,
      failedStep: unavailable.failedStep,
      reason: unavailable.reason,
      cleanupReason: probe.cleanupReason,
      attempt: unavailable.attempt,
    });
    throw Object.assign(new Error(unavailable.reason), { storageSnapshot: unavailable });
  }

  publish({ ...context, state: "loading" });
  try {
    const loaded = force ? await retryLoadData() : await loadConfig();
    return classifyLoadResult(loaded, context);
  } catch (error) {
    if (error?.code === "upgrade_required") throw error;
    const unavailable = publish({
      ...context,
      state: "unavailable",
      reason: String(error?.message || "configuration_load_failed").slice(0, 120),
      settledAt: Date.now(),
    });
    setFeatureStatus("Storage", "failing", unavailable.reason);
    recordStorageHealth("LOAD_FAILED", "error", "Configuration storage bootstrap failed.", {
      manager: unavailable.manager,
      reason: unavailable.reason,
      attempt: unavailable.attempt,
    });
    throw Object.assign(error instanceof Error ? error : new Error(unavailable.reason), {
      storageSnapshot: unavailable,
    });
  }
}

export function startStorageBootstrap(options = {}) {
  if (activePromise) return activePromise;
  const current = getStorageReadinessSnapshot();
  if (!options.force && current.state === "upgrade-required") {
    return Promise.reject(Object.assign(new Error("upgrade_required"), {
      code: "upgrade_required",
      storageSnapshot: current,
    }));
  }
  if (!options.force && isTerminalStorageState(current.state)) return Promise.resolve(current);
  activePromise = executeBootstrap(options).finally(() => { activePromise = null; });
  return activePromise;
}

export function retryStorageBootstrap() {
  return startStorageBootstrap({ force: true });
}

export function getStorageBootstrapSnapshot() {
  return getStorageReadinessSnapshot();
}

export function resetStorageBootstrapForTests() {
  activePromise = null;
  attempt = 0;
  resetStorageReadinessForTests();
}

registerDiagnosticsProvider("storage", getStorageBootstrapSnapshot);
