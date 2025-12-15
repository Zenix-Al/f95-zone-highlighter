import { renderSettingsSection } from "./settingsSection";

export function reRenderSettingsSection(containerId, meta) {
  if (!clearContainer(containerId)) return;

  renderSettingsSection(containerId, meta);
}

export function clearContainer(id) {
  const el = document.getElementById(id);
  if (el) {
    el.innerHTML = "";
    return true;
  }
  return false;
}
