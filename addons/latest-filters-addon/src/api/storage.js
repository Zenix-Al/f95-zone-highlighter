import {
  FILTER_PRESETS_STORAGE_KEY,
  FILTER_SETTINGS_STORAGE_KEY,
} from "../constants.js";

function hasGMStorage(gm) {
  return typeof gm?.getValue === "function" && typeof gm?.setValue === "function";
}

export function createStorageAdapter({ core, addonId, gm = globalThis.GM } = {}) {
  const localPresetsKey = `addon:${String(addonId || "latest-filters-addon")}:presets`;

  async function getCoreValue(key, defaultValue) {
    const result = await core.invokeCoreAction("storage.get", { key, defaultValue });
    return result?.ok ? result.value : defaultValue;
  }

  async function setCoreValue(key, value) {
    return core.invokeCoreAction("storage.set", { key, value });
  }

  return {
    localPresetsKey,
    async getSettings(defaultValue) {
      return getCoreValue(FILTER_SETTINGS_STORAGE_KEY, defaultValue);
    },
    setSettings(value) {
      return setCoreValue(FILTER_SETTINGS_STORAGE_KEY, value);
    },
    async getPresets(defaultValue = []) {
      if (!hasGMStorage(gm)) return getCoreValue(FILTER_PRESETS_STORAGE_KEY, defaultValue);
      try {
        return await gm.getValue(localPresetsKey, defaultValue);
      } catch {
        return defaultValue;
      }
    },
    async setPresets(value) {
      if (hasGMStorage(gm)) {
        try {
          await gm.setValue(localPresetsKey, value);
          return { ok: true };
        } catch {
          // Preserve the existing core-storage fallback when GM storage fails.
        }
      }
      return setCoreValue(FILTER_PRESETS_STORAGE_KEY, value);
    },
    async getTagPrefs() {
      return core.invokeCoreAction("config.getTagPrefs", {});
    },
  };
}
