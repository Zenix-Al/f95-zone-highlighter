import {
  LIBRARY_SETTINGS_DEFAULT,
  LIBRARY_STORAGE_KEY,
} from "../constants.js";
import { getStoredValue, setStoredValue } from "../api/storage.js";

export function createLibrarySettings(core) {
  function normalize(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      ...LIBRARY_SETTINGS_DEFAULT,
      ...source,
      enabled: source.enabled !== false,
      showPageButtons: source.showPageButtons !== false,
    };
  }

  async function load() {
    return normalize(
      await getStoredValue(core, LIBRARY_STORAGE_KEY, LIBRARY_SETTINGS_DEFAULT),
    );
  }

  async function save(nextPartial = {}) {
    const next = normalize({ ...(await load()), ...nextPartial });
    await setStoredValue(core, LIBRARY_STORAGE_KEY, next);
    return next;
  }

  return {
    load,
    save,
    storage: {
      get: (key, defaultValue = null) => getStoredValue(core, key, defaultValue),
      set: (key, value) => setStoredValue(core, key, value),
    },
  };
}
