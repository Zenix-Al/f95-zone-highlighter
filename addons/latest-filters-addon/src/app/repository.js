import { FILTER_SETTINGS_DEFAULT } from "../constants.js";
import { normalizePreset, normalizePresets } from "../domain/presets.js";

function normalizeSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const sourceState = source.state && typeof source.state === "object" ? source.state : {};
  return {
    ...FILTER_SETTINGS_DEFAULT,
    ...source,
    enabled: source.enabled !== false,
    state: {
      ...FILTER_SETTINGS_DEFAULT.state,
      showPageButton: sourceState.showPageButton !== false,
    },
  };
}

function normalizeTagPrefs(result) {
  const value = result?.value && typeof result.value === "object" ? result.value : {};
  return {
    tags: Array.isArray(value.tags) ? value.tags : [],
    preferredTags: Array.isArray(value.preferredTags) ? value.preferredTags : [],
    excludedTags: Array.isArray(value.excludedTags) ? value.excludedTags : [],
    markedTags: Array.isArray(value.markedTags) ? value.markedTags : [],
    color: value.color && typeof value.color === "object" ? value.color : {},
  };
}

export function createLatestFiltersRepository(storage) {
  return {
    async loadSettings() {
      return normalizeSettings(await storage.getSettings(FILTER_SETTINGS_DEFAULT));
    },
    async saveSettings(nextPartial = {}) {
      const current = await this.loadSettings();
      const next = normalizeSettings({ ...current, ...nextPartial });
      await storage.setSettings(next);
      return next;
    },
    async loadPresets() {
      return normalizePresets(await storage.getPresets([]));
    },
    async savePresets(nextPresets) {
      const normalized = normalizePresets(nextPresets);
      await storage.setPresets(normalized);
      return normalized;
    },
    async loadTagPrefs() {
      const result = await storage.getTagPrefs();
      return result?.ok ? normalizeTagPrefs(result) : { error: String(result?.reason || "unknown") };
    },
    normalizeSettings,
    normalizePreset,
  };
}
