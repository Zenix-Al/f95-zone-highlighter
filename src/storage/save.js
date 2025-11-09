import {
  config,
  debug,
  defaultColors,
  defaultLatestSettings,
  defaultOverlaySettings,
  defaultThreadSetting,
  metrics,
} from "../constants";

export async function saveConfigKeys(data) {
  const promises = Object.entries(data).map(([key, value]) => GM.setValue(key, value));
  await Promise.all(promises);
  if (debug) console.log("Config saved (keys)", data);
}

// Deep merge helper
function deepMerge(defaults, loaded) {
  const result = Array.isArray(defaults) ? [...defaults] : { ...defaults };

  if (!loaded || typeof loaded !== "object") return result;

  for (const key in defaults) {
    if (loaded[key] === undefined) {
      // Use default if missing
      result[key] = defaults[key];
    } else if (
      typeof defaults[key] === "object" &&
      defaults[key] !== null &&
      !Array.isArray(defaults[key])
    ) {
      // Recursively merge nested objects
      result[key] = deepMerge(defaults[key], loaded[key]);
    } else {
      // Use loaded value
      result[key] = loaded[key];
    }
  }

  return result;
}

export async function loadData() {
  let parsed = {};
  try {
    parsed = (await GM.getValues(Object.keys(config))) ?? {};
  } catch (e) {
    debug && console.warn("loadData error:", e);
    parsed = {};
  }

  const result = {
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    preferredTags: Array.isArray(parsed.preferredTags) ? parsed.preferredTags : [],
    excludedTags: Array.isArray(parsed.excludedTags) ? parsed.excludedTags : [],
    color: deepMerge(defaultColors, parsed.color),
    overlaySettings: deepMerge(defaultOverlaySettings, parsed.overlaySettings),
    threadSettings: deepMerge(defaultThreadSetting, parsed.threadSettings),
    configVisibility: parsed.configVisibility ?? true,
    minVersion: parsed.minVersion ?? 0.5,
    latestSettings: deepMerge(defaultLatestSettings, parsed.latestSettings),
    metrics: deepMerge(metrics, parsed.metrics),
  };

  debug && console.log("loadData result:", result);

  return result;
}
