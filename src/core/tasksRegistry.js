import { config, state } from "../config";
import { updateLatestUI } from "../ui/settings";
import {
  reprocessAllTiles,
  disableLatestOverlay,
  enableLatestOverlay,
} from "../features/latest-overlay/latest-overlay.js";
import { createDebouncedTask } from "./createDebouncedTask.js";
import { toggleThreadTagOverlay } from "../features/thread-overlay/index.js";
export const debouncedProcessThreadTags = createDebouncedTask(() => {
  if (!state.isThread) return;
  toggleThreadTagOverlay();
}, 100);

export const debouncedUpdateLatestUI = createDebouncedTask(() => updateLatestUI(), 100);

export const debouncedProcessAllTiles = createDebouncedTask(() => {
  if (!state.isLatest && !config.latestSettings.latestOverlayToggle) return;
  enableLatestOverlay();
}, 100);

export const debouncedProcessAllTilesReset = createDebouncedTask(() => {
  if (!config.latestSettings.latestOverlayToggle || !state.isLatest) return;
  reprocessAllTiles();
}, 100);
export const debouncedProcessAllTilesDisable = createDebouncedTask(() => {
  if (!config.latestSettings.latestOverlayToggle || !state.isLatest) return;
  disableLatestOverlay();
}, 100);
