import stateManager, { config } from "../config.js";
import { updateLatestUI } from "../ui/settings";
import { latestOverlayFeature, reprocessAllTiles } from "../features/latest-overlay/index.js";
import { createDebouncedTask } from "./createDebouncedTask.js";
import { threadOverlayFeature } from "../features/thread-overlay/index.js";
export const debouncedProcessThreadTags = createDebouncedTask(() => {
  if (!stateManager.get("isThread")) return;
  threadOverlayFeature.toggle(threadOverlayFeature.isEnabled());
}, 100);

export const debouncedUpdateLatestUI = createDebouncedTask(() => updateLatestUI(), 100);

export const debouncedProcessAllTiles = createDebouncedTask(() => {
  if (!stateManager.get("isLatest") || !config.latestSettings.latestOverlayToggle) return;
  // Use the feature interface which manages lifecycle and health state
  try {
    latestOverlayFeature.enable();
  } catch {
    // best-effort
  }
}, 200);

export const debouncedProcessAllTilesReset = createDebouncedTask(() => {
  if (!config.latestSettings.latestOverlayToggle || !stateManager.get("isLatest")) return;
  try {
    // Only reprocess if feature is active to avoid unnecessary work
    if (latestOverlayFeature.isEnabled()) reprocessAllTiles();
  } catch {
    // best-effort
  }
}, 200);
export const debouncedProcessAllTilesDisable = createDebouncedTask(() => {
  if (!config.latestSettings.latestOverlayToggle || !stateManager.get("isLatest")) return;
  try {
    latestOverlayFeature.disable();
  } catch {
    // best-effort
  }
}, 200);
