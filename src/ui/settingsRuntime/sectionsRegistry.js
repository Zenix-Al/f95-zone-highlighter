import { renderSettingsSection } from "../renderers/settingsSection.js";
import { registerSettingsMetadata } from "../settings/metaRegistry.js";

export const SETTINGS_SECTION_CONTAINERS = {
  global: "global-settings-container",
  latest: "latest-settings-container",
  thread: "thread-settings-container",
  color: "color-container",
};

const contributionsBySection = new Map(
  Object.keys(SETTINGS_SECTION_CONTAINERS).map((sectionId) => [sectionId, new Map()]),
);
let nextContributionId = 0;

function getSectionEntries(sectionId) {
  const contributions = contributionsBySection.get(sectionId);
  if (!contributions) return {};
  return Object.assign({}, ...[...contributions.values()].map((entry) => entry.metaMap));
}

export function contributeToSection(sectionId, metaMap, ownerId = "feature") {
  const id = String(sectionId || "").trim();
  const owner = String(ownerId || "feature").trim() || "feature";
  if (!id || !(id in SETTINGS_SECTION_CONTAINERS)) {
    throw new Error(`Unknown settings section '${id || "(empty)"}'.`);
  }
  if (!metaMap || typeof metaMap !== "object" || Array.isArray(metaMap)) {
    throw new Error(`Settings contribution for '${id}' must be an object map.`);
  }

  const contributions = contributionsBySection.get(id);
  const unregisterMetadata = registerSettingsMetadata(id, metaMap, owner);
  const contributionId = `${owner}:${++nextContributionId}`;
  contributions.set(contributionId, { metaMap: { ...metaMap }, unregisterMetadata });

  let released = false;
  return () => {
    if (released) return 0;
    released = true;
    const contribution = contributions.get(contributionId);
    contributions.delete(contributionId);
    return contribution?.unregisterMetadata?.() || 0;
  };
}

export function renderAllSettingsSections() {
  for (const [sectionId, containerId] of Object.entries(SETTINGS_SECTION_CONTAINERS)) {
    renderSettingsSection(containerId, getSectionEntries(sectionId));
  }
}
