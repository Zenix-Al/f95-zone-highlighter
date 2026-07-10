import { stateManager, config } from "../config.js";
import { createFeature } from "../core/featureFactory.js";
import { sanitizeConfig } from "../config/schema.js";
import { storageAdapter } from "./storageAdapter.js";
import { CONFIG_ENVELOPE_KEY } from "./settingsService.js";
import { applyConfigChange } from "./configChangeApplication.js";
import { reportFeatureWarning } from "../core/featureHealth.js";

let listenerId = null;
let lastApplied = null;

function compareEnvelope(a, b) {
  const revision = Number(a?.revision || 0) - Number(b?.revision || 0);
  if (revision) return revision;
  const updatedAt = Number(a?.updatedAt || 0) - Number(b?.updatedAt || 0);
  if (updatedAt) return updatedAt;
  return String(a?.writerId || "").localeCompare(String(b?.writerId || ""));
}

function applyIncoming(envelope) {
  if (!envelope?.data || (lastApplied && compareEnvelope(envelope, lastApplied) <= 0)) return false;
  const validated = sanitizeConfig(envelope.data);
  if (validated.issues.length > 0) { reportFeatureWarning("Sync", "invalid remote config", "validation"); return false; }
  applyConfigChange(validated.data, { origin: "remote-sync" });
  lastApplied = { revision: envelope.revision, updatedAt: envelope.updatedAt, writerId: envelope.writerId };
  return true;
}

function initCrossTabSync() {
  if (listenerId !== null || !config.globalSettings.enableCrossTabSync) return;
  listenerId = storageAdapter.subscribe(CONFIG_ENVELOPE_KEY, (_name, _oldValue, newValue, remote) => {
    if (!remote || !config.globalSettings.enableCrossTabSync) return;
    try { applyIncoming(newValue); } catch (error) { reportFeatureWarning("Sync", error, "remote-apply"); }
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
export { applyIncoming, compareEnvelope, crossTabSyncFeature };
