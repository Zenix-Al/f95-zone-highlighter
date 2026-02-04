import { config, state } from "../config";
import { updateLatestUI } from "../ui/settings";
import { processAllTiles, resetAllTiles } from "../features/latestService";
import { toggleThreadTagOverlay } from "../features/threadService";
import { createQueuedTask } from "./createQueuedTask";

export const queuedProcessAllTilesReset = createQueuedTask(() => {
  if (!config.latestSettings.latestOverlayToggle || !state.isLatest) return;
  processAllTiles(true);
}, 100);
export const queuedProcessThreadTags = createQueuedTask(() => {
  if (!state.isThread) return;
  toggleThreadTagOverlay();
}, 100);
export const queuedUpdateLatestUI = createQueuedTask(() => updateLatestUI());
export const queuedResetAllTiles = createQueuedTask(() => {
  if (!state.isLatest) return;
  resetAllTiles();
  return false;
});
export const queuedProcessAllTiles = createQueuedTask(() => {
  if (!state.isLatest && !config.latestSettings.latestOverlayToggle) return;
  processAllTiles();
  return false;
});
