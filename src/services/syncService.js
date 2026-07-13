import { stateManager, config } from "../config.js";
import { createFeature } from "../core/featureFactory.js";
import { recordHealthEvent } from "../core/featureHealth.js";
import { storageAdapter } from "./storageAdapter.js";
import {
  CONFIG_ENVELOPE_KEY,
  CONFIG_WRITER_ID,
  validateConfigEnvelope,
} from "./settingsService.js";
import { applyConfigChange } from "./configChangeApplication.js";

let listenerId = null;
let lastApplied = null;

function envelopeTuple(envelope) {
  return {
    revision: Number(envelope?.revision) || 0,
    updatedAt: Number(envelope?.updatedAt) || 0,
    writerId: String(envelope?.writerId || ""),
  };
}

export function compareEnvelope(a, b) {
  const left = envelopeTuple(a);
  const right = envelopeTuple(b);
  const revision = left.revision - right.revision;
  if (revision) return revision;
  const updatedAt = left.updatedAt - right.updatedAt;
  if (updatedAt) return updatedAt;
  return left.writerId.localeCompare(right.writerId);
}

function recordSyncDiagnostic(code, message, details = {}) {
  return recordHealthEvent({
    code,
    severity: code === "SYNC_INVALID_ENVELOPE" ? "warning" : "info",
    ownerId: "syncService",
    subsystem: "sync",
    message,
    details,
  });
}

function setLastApplied(envelope) {
  lastApplied = envelopeTuple(envelope);
}

export function applyIncoming(envelope) {
  const validation = validateConfigEnvelope(envelope);
  if (!validation.valid) {
    recordSyncDiagnostic("SYNC_INVALID_ENVELOPE", "Remote config envelope was rejected.", {
      issues: validation.issues.slice(0, 8).map((issue) => ({ path: issue.path, code: issue.code })),
    });
    return false;
  }

  if (validation.envelope.writerId === CONFIG_WRITER_ID) return false;
  if (lastApplied && compareEnvelope(validation.envelope, lastApplied) <= 0) {
    recordSyncDiagnostic("SYNC_STALE_ENVELOPE", "Remote config envelope was older than the applied tuple.", {
      revision: validation.envelope.revision,
      writerId: validation.envelope.writerId,
    });
    return false;
  }

  applyConfigChange(validation.data, { origin: "remote-sync", syncableOnly: true });
  setLastApplied(validation.envelope);
  return true;
}

async function initCrossTabSync() {
  if (listenerId !== null || !config.globalSettings.enableCrossTabSync) return;

  try {
    const current = await storageAdapter.get(CONFIG_ENVELOPE_KEY, null);
    if (validateConfigEnvelope(current).valid) setLastApplied(current);
    else lastApplied = { revision: 0, updatedAt: 0, writerId: CONFIG_WRITER_ID };
  } catch {
    lastApplied = { revision: 0, updatedAt: 0, writerId: CONFIG_WRITER_ID };
    recordSyncDiagnostic("SYNC_STORAGE_READ_FAILED", "Could not initialize the local sync tuple.");
  }

  listenerId = storageAdapter.subscribe(CONFIG_ENVELOPE_KEY, (_name, _oldValue, newValue, remote) => {
    try {
      if (!remote) {
        const local = validateConfigEnvelope(newValue);
        if (local.valid) setLastApplied(local.envelope);
        return;
      }
      if (config.globalSettings.enableCrossTabSync) applyIncoming(newValue);
    } catch {
      recordSyncDiagnostic("SYNC_APPLY_FAILED", "Remote config envelope processing failed.");
    }
  });
  stateManager.set("isCrossTabSyncInitialized", true);
}

function disableCrossTabSync() {
  if (listenerId !== null) storageAdapter.unsubscribe(listenerId);
  listenerId = null;
  stateManager.set("isCrossTabSyncInitialized", false);
}

const crossTabSyncFeature = createFeature("Cross Tab Sync", {
  configPath: "globalSettings.enableCrossTabSync",
  enable: initCrossTabSync,
  disable: disableCrossTabSync,
});

export function toggleCrossTabSync(enabled) { return crossTabSyncFeature.toggle(Boolean(enabled)); }
export function resetSyncServiceForTests() { disableCrossTabSync(); lastApplied = null; }
export { crossTabSyncFeature };
