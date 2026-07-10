import {
  reprocessLatestTilesAfterSettingsChange,
  refreshThreadOverlayAfterSettingsChange,
} from "../../settingsRuntime/effectTasks.js";

export function triggerTagUpdateEffects() {
  reprocessLatestTilesAfterSettingsChange();
  refreshThreadOverlayAfterSettingsChange();
}
