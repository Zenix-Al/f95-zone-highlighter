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

    configVisibility: parsed.configVisibility ?? true,

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
  };

  // Final safety: ensure latestSettings has minVersion
  if (!result.latestSettings.minVersion && result.latestSettings.minVersion !== 0) {
    result.latestSettings.minVersion = 0.5;
  }

  debug && console.log("loadData result:", result);

  return result;
}
