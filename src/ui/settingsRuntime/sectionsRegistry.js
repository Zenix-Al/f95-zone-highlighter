import { renderSettingsSection } from "../renderers/settingsSection.js";

export const SETTINGS_SECTION_CONTAINERS = {
  global: "global-settings-container",
  latest: "latest-settings-container",
  thread: "thread-settings-container",
  color: "color-container",
};

const _contributionsBySection = {
  global: {},
  latest: {},
  thread: {},
  color: {},
};

export function contributeToSection(sectionId, metaMap) {
  const id = String(sectionId || "").trim();
  if (!id || !(id in SETTINGS_SECTION_CONTAINERS)) return;
  if (!metaMap || typeof metaMap !== "object") return;
  Object.assign(_contributionsBySection[id], metaMap);
}

export function renderAllSettingsSections() {
  for (const [sectionId, containerId] of Object.entries(SETTINGS_SECTION_CONTAINERS)) {
    renderSettingsSection(containerId, _contributionsBySection[sectionId] || {});
  }
}
