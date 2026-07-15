import { defaultColors } from "../../config";
import { colorSettingsMeta } from "../settings/colorSettings";
import { reRenderSettingsSection } from "../renderers/reRenderSetting";
import { updateConfig } from "../../services/settingsService.js";
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
  const persisted = await updateConfig((draft) => {
    draft.color = { ...defaultColors };
  }, { origin: "settings:reset-color" });
  if (!persisted.committed) return;

  reRenderSettingsSection("color-container", colorSettingsMeta);
  showToast("Colors have been reset to default");
}
