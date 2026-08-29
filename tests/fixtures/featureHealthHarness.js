import { stateManager } from "../../src/config.js";
import {
  formatFeatureHealthReport,
  showFeatureHealthBox,
  summarizeAddons,
  summarizeFeatureStatuses,
} from "../../src/ui/components/featureHealth/index.js";
import { publishStorageReadiness } from "../../src/services/storageReadiness.js";
import { syncStorageReadOnlyState } from "../../src/ui/settings/storageReadOnly.js";

export function setFeatureHealthRoot(root) {
  stateManager.set("shadowRoot", root);
}

export function publishStorageState(state, overrides = {}) {
  return publishStorageReadiness({
    state,
    source: "fixture",
    canRead: true,
    canWrite: state === "ready",
    canDelete: true,
    manager: "fixture-manager",
    attempt: 2,
    settledAt: 1000,
    ...overrides,
  });
}

export {
  formatFeatureHealthReport,
  showFeatureHealthBox,
  summarizeAddons,
  summarizeFeatureStatuses,
  syncStorageReadOnlyState,
};
