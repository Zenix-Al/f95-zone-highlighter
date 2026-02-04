import { debugLog } from "../../core/logger";
import { state } from "../../config";
import { renderSetting } from "./renderSetting";

export function renderSettingsSection(containerId, metaMap) {
  const container = state.shadowRoot.getElementById(containerId);
  debugLog("SettingsSection", `Rendering settings section: ${containerId}`);
  if (!container) {
    debugLog("SettingsSection", `Container not found: ${containerId}`);
    return;
  }

  container.innerHTML = "";

  Object.entries(metaMap).forEach(([key, meta]) => {
    container.appendChild(renderSetting(key, meta));
  });
}
