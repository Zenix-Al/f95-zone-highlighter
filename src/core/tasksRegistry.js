import { latestOverlayFeature, reprocessAllTiles } from "../features/latest-overlay/index.js";
import { createDebouncedTask } from "./createDebouncedTask.js";
import { threadOverlayFeature } from "../features/thread-overlay/index.js";
export const debouncedProcessThreadTags = createDebouncedTask(() => {
  threadOverlayFeature.sync();
}, 100);

export const debouncedProcessAllTiles = createDebouncedTask(() => {
  latestOverlayFeature.sync();
}, 200);

export const debouncedProcessAllTilesReset = createDebouncedTask(() => {
  reprocessAllTiles();
}, 200);
export const debouncedProcessAllTilesDisable = createDebouncedTask(() => {
  latestOverlayFeature.disable();
}, 200);
