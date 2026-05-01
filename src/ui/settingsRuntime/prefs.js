import { stateManager } from "../../config.js";

const DEFAULT_SETTINGS_PANEL = "settings-panel-general";

export const SETTINGS_ACTIVE_PANEL_STORAGE_KEY = "settingsUiActivePanel";
export const SETTINGS_PINNED_ADDONS_STORAGE_KEY = "settingsUiPinnedAddonIds";

export function getDefaultSettingsPanelId() {
  return DEFAULT_SETTINGS_PANEL;
}

export async function persistSettingsUiValue(key, value) {
  try {
    await GM.setValue(key, value);
  } catch (error) {
    console.warn(`[settings-ui] Failed to persist ${key}:`, error);
  }
}

export async function ensureSettingsUiPrefsLoaded() {
  if (stateManager.get("settingsUiPrefsLoaded")) return;

  let activePanel = DEFAULT_SETTINGS_PANEL;
  let pinnedAddonIds = [];

  try {
    activePanel = String(
      await GM.getValue(SETTINGS_ACTIVE_PANEL_STORAGE_KEY, DEFAULT_SETTINGS_PANEL),
    );
  } catch {}

  try {
    const storedPins = await GM.getValue(SETTINGS_PINNED_ADDONS_STORAGE_KEY, []);
    if (Array.isArray(storedPins)) {
      pinnedAddonIds = storedPins.map((id) => String(id || "").trim()).filter(Boolean);
    }
  } catch {}

  stateManager.set("settingsActivePanel", activePanel || DEFAULT_SETTINGS_PANEL);
  stateManager.set("settingsPinnedAddonIds", [...new Set(pinnedAddonIds)]);
  stateManager.set("settingsUiPrefsLoaded", true);
}
