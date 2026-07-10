// UI settings-effect owner. These debounced tasks reconcile overlay UI after
// setting changes; callers invoke them only from settings effects. Cancellation
// is replacement-based: a newer call supersedes the pending timer.
import { latestOverlayFeature, reprocessAllTiles } from "../../features/latest-overlay/index.js";
import { createDebouncedTask } from "../../core/createDebouncedTask.js";
import { threadOverlayFeature } from "../../features/thread-overlay/index.js";
import { debugLog } from "../../core/logger.js";
import { resourceManager } from "../../core/resourceManager.js";

export const refreshThreadOverlayAfterSettingsChange = createDebouncedTask(() => {
  threadOverlayFeature.sync();
}, 100);
export const refreshLatestOverlayAfterSettingsChange = createDebouncedTask(() => {
  latestOverlayFeature.sync();
}, 200);
export const reprocessLatestTilesAfterSettingsChange = createDebouncedTask(() => {
  debugLog("SettingsEffects", "Reprocess all tiles triggered");
  reprocessAllTiles();
}, 200);
export const disableLatestOverlayAfterSettingsChange = createDebouncedTask(() => {
  latestOverlayFeature.disable();
}, 200);

for (const [id, task] of Object.entries({
  "settings-effect:thread-refresh": refreshThreadOverlayAfterSettingsChange,
  "settings-effect:latest-refresh": refreshLatestOverlayAfterSettingsChange,
  "settings-effect:latest-reprocess": reprocessLatestTilesAfterSettingsChange,
  "settings-effect:latest-disable": disableLatestOverlayAfterSettingsChange,
})) {
  resourceManager.register(id, () => task.cancel(), "ui:settings-effects");
}
