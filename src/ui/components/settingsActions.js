import { defaultColors } from "../../config";
import { reprocessAllTiles } from "../../features/latest-overlay/index.js";
import { refreshThreadOverlayAfterSettingsChange } from "../settingsRuntime/effectTasks.js";
import { colorSettingsMeta } from "../settings/colorSettings";
import { reRenderSettingsSection } from "../renderers/reRenderSetting";
import { updateColorStyle } from "../helpers/updateColorStyle";
import { saveConfigKeys } from "../../services/settingsService";
import { showToast } from "./toast";

let resetColorConfirmUntil = 0;

export async function resetColor() {
  const now = Date.now();
  if (now > resetColorConfirmUntil) {
    resetColorConfirmUntil = now + 3000;
    showToast("Press reset again within 3s to confirm.");
    return;
  }

  resetColorConfirmUntil = 0;
  const persisted = await saveConfigKeys({ color: { ...defaultColors } });
  if (!persisted.committed) return;
  updateColorStyle();

  reprocessAllTiles();
  refreshThreadOverlayAfterSettingsChange();

  reRenderSettingsSection("color-container", colorSettingsMeta);
  showToast("Colors have been reset to default");
}
