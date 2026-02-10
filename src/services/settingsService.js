import {
  config,
  defaultColors,
  defaultGlobalSettings,
  defaultLatestSettings,
  defaultOverlaySettings,
  defaultThreadSetting,
  metrics,
} from "../config";
import { debugLog } from "../core/logger";

export async function saveConfigKeys(updates) {
  const promises = Object.entries(updates).map(([key, value]) => {
    return GM.setValue(key, value);
  });
  await Promise.all(promises);
  debugLog("saveConfigKeys", `Config updated: ${JSON.stringify(updates)}`);
}

export async function loadData() {
  let parsed = {};
  try {
    parsed = (await GM.getValues(Object.keys(config))) ?? {};
  } catch (e) {
    debugLog("loadData", `Error loading data: ${e}`);
    parsed = {};
  }

  // Helper: deep merge with defaults
  const mergeWithDefault = (saved, defaultObj) => {
    if (!saved || typeof saved !== "object") return { ...defaultObj };
    const result = { ...defaultObj }; // start with defaults
    Object.keys(saved).forEach((key) => {
      if (key in result) {
        result[key] = saved[key]; // only override if key exists in default
      }
      // ignore unknown keys (future cleanup)
    });
    return result;
  };

  const result = {
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    preferredTags: Array.isArray(parsed.preferredTags) ? parsed.preferredTags : [],
    excludedTags: Array.isArray(parsed.excludedTags) ? parsed.excludedTags : [],

    color: mergeWithDefault(parsed.color, defaultColors),

    overlaySettings: mergeWithDefault(parsed.overlaySettings, defaultOverlaySettings),

    threadSettings: mergeWithDefault(parsed.threadSettings, defaultThreadSetting),

    latestSettings: mergeWithDefault(parsed.latestSettings, defaultLatestSettings),
    globalSettings: mergeWithDefault(parsed.globalSettings, defaultGlobalSettings),

    metrics: mergeWithDefault(parsed.metrics, metrics),
    savedNotifID: parsed.savedNotifID || null,
    processingDownload: parsed.processingDownload || false,
  };

  // --- Data Migration & Safety Checks ---

  // Migrate old flat `minVersion` to `latestSettings.minVersion`.
  // This runs if a user has an old config with `minVersion` but `latestSettings` from storage lacks it.
  if (
    typeof parsed.minVersion === "number" &&
    (!parsed.latestSettings || typeof parsed.latestSettings.minVersion === "undefined")
  ) {
    result.latestSettings.minVersion = parsed.minVersion;
  }

  // Final safety check: ensure latestSettings has a valid minVersion.
  if (typeof result.latestSettings.minVersion !== "number") {
    result.latestSettings.minVersion = defaultLatestSettings.minVersion;
  }
  debugLog("loadData", `loadData result:`, result);

  return result;
}
