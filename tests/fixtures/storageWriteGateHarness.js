import { config } from "../../src/config.js";
import { setAddonStateValue } from "../../src/services/addons/state.js";
import { loadConfig, saveConfigKeys } from "../../src/services/settingsService.js";
import {
  publishStorageReadiness,
  resetStorageReadinessForTests,
} from "../../src/services/storageReadiness.js";

export async function loadForWriteGate() {
  resetStorageReadinessForTests();
  return loadConfig();
}

export function publishGateState(state, reason = "") {
  return publishStorageReadiness({
    state,
    reason,
    canRead: true,
    canWrite: true,
    canDelete: true,
    source: "fixture",
    attempt: 1,
  });
}

export function saveCoreToggle() {
  return saveConfigKeys({
    globalSettings: {
      ...config.globalSettings,
      closeNotifOnClick: !config.globalSettings.closeNotifOnClick,
    },
  }, { origin: "storage-write-gate-test" });
}

export function saveAddonValue() {
  return setAddonStateValue("example-addon", "fixture-setting", true);
}

