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

export async function saveConfigKeys(updates, replace = false) {
  const promises = [];

  for (const [key, value] of Object.entries(updates)) {
    if (replace) {
      promises.push(GM.setValue(key, value));
    } else if (Array.isArray(value)) {
      // treat as "add these items"
      let current = (await GM.getValue(key, [])) || [];
      const toAdd = Array.isArray(value) ? value : [value];
      const newList = [...current, ...toAdd.filter((x) => !current.includes(x))];
      promises.push(GM.setValue(key, newList));
    } else {
      // normal overwrite
      promises.push(GM.setValue(key, value));
    }
  }

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

    // Backward compat: old flat minVersion → migrate to latestSettings
    // (safe even if latestSettings already exists)
    ...(typeof parsed.minVersion === "number" &&
      !parsed.latestSettings?.minVersion && {
        latestSettings: {
          ...(parsed.latestSettings || defaultLatestSettings),
          minVersion: parsed.minVersion,
        },
      }),
    metrics: mergeWithDefault(parsed.metrics, metrics),
    savedNotifID: parsed.savedNotifID || null,
    processingDownload: parsed.processingDownload || false,
  };

  // Final safety: ensure latestSettings has minVersion
  if (!result.latestSettings.minVersion && result.latestSettings.minVersion !== 0) {
    result.latestSettings.minVersion = 0.5;
  }

  debugLog("loadData", `loadData result:`, result);

  return result;
}
