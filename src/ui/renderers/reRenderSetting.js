import stateManager from "../../config.js";
import { renderSettingsSection } from "./settingsSection";

export function reRenderSettingsSection(containerId, meta) {
  if (!clearContainer(containerId)) return;

  renderSettingsSection(containerId, meta);
}

export function clearContainer(id) {
  if (!stateManager.get('shadowRoot')) return false;
  const el = stateManager.get('shadowRoot').getElementById(id);
  if (el) {
    el.innerHTML = "";
    return true;
  }
  return false;
}
