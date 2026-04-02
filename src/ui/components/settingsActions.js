import { config, defaultColors } from "../../config";
import { reprocessAllTiles } from "../../features/latest-overlay/index.js";
import { debouncedProcessThreadTags } from "../../core/tasksRegistry";
import { colorSettingsMeta } from "../settings/colorSettings";
import { reRenderSettingsSection } from "../renderers/reRenderSetting";
import { updateColorStyle } from "../helpers/updateColorStyle";
import { saveConfigKeys } from "../../services/settingsService";
import { showToast } from "./toast";

let resetColorConfirmUntil = 0;

export function resetColor() {
  const now = Date.now();
  if (now > resetColorConfirmUntil) {
    resetColorConfirmUntil = now + 3000;
    showToast("Press reset again within 3s to confirm.");
    return;
  }

  resetColorConfirmUntil = 0;
  config.color = { ...defaultColors };
  updateColorStyle();
  saveConfigKeys({ color: config.color });

  reprocessAllTiles();
  debouncedProcessThreadTags();

  reRenderSettingsSection("color-container", colorSettingsMeta);
  showToast("Colors have been reset to default");
}
