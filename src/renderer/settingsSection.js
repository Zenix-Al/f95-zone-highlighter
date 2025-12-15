import { debug } from "../constants";
import { renderSetting } from "./renderSetting";

export function renderSettingsSection(containerId, metaMap) {
  const container = document.getElementById(containerId);
  debug && console.log("Rendering settings section:", containerId, metaMap);
  if (!container) {
    debug && console.warn("Container not found:", containerId);
    return;
  }

  container.innerHTML = "";

  Object.entries(metaMap).forEach(([key, meta]) => {
    container.appendChild(renderSetting(key, meta));
  });
}
