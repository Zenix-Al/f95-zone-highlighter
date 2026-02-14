import { config, defaultColors } from "../../config";
import { reprocessAllTiles as reprocessLatestOverlay } from "../../features/latest-overlay/index.js";
import { debouncedProcessThreadTags } from "../../core/tasksRegistry";
import { colorSettingsMeta } from "../settings/colorSettings";
import { reRenderSettingsSection } from "../renderers/reRenderSetting";
import { updateColorStyle } from "../helpers/updateColorStyle";
import { saveConfigKeys } from "../../services/settingsService";
import { showToast } from "./toast";

export function resetColor() {
  if (confirm("Are you sure you want to reset all colors to default?")) {
    config.color = { ...defaultColors };
    updateColorStyle();
    saveConfigKeys({ color: config.color });

    // The called functions have internal guards to only run on the correct page
    // and if the corresponding feature is enabled.
    reprocessLatestOverlay();
    debouncedProcessThreadTags();

    reRenderSettingsSection("color-container", colorSettingsMeta);
    showToast("Colors have been reset to default");
  }
}
