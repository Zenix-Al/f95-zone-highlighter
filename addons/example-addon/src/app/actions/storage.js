import {
  getStoredValue,
  getStorageUsage,
  getTagPrefs,
  setStoredValue,
} from "../../api/storage.js";
import { EXAMPLE_STORAGE_KEY } from "../../constants.js";
import { summarizeTagPrefs } from "../../domain/playgroundData.js";

export function createStorageActions({ core, state }) {
  return {
    "storage-set": async () => {
      const value = {
        text: "Hello from storage.set",
        updatedAt: new Date().toISOString(),
      };
      const result = await setStoredValue(core, EXAMPLE_STORAGE_KEY, value);
      if (result?.ok) state.storage.value = value;
      return result;
    },
    "storage-get": async () => {
      const result = await getStoredValue(core, EXAMPLE_STORAGE_KEY, null);
      state.storage.value = result?.ok
        ? result.value
        : { error: result?.reason || "unknown" };
      return result;
    },
    "storage-usage": async () => {
      const result = await getStorageUsage(core);
      state.storage.usage = result?.ok
        ? result.value
        : { error: result?.reason || "unknown" };
      return result;
    },
    "storage-tags": async () => {
      const result = await getTagPrefs(core);
      state.storage.tagPrefsSummary = result?.ok
        ? summarizeTagPrefs(result.value)
        : { error: result?.reason || "unknown" };
      return result;
    },
  };
}
