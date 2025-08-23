import {
  config,
  debug,
  defaultColors,
  defaultLatestSettings,
  defaultOverlaySettings,
  defaultThreadSetting,
} from "../constants";

export async function saveConfigKeys(data) {
  const promises = Object.entries(data).map(([key, value]) => GM.setValue(key, value));
  await Promise.all(promises);
  if (debug) console.log("Config saved (keys)", data);
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
    color: parsed.color && typeof parsed.color === "object" ? parsed.color : { ...defaultColors },
    overlaySettings:
      parsed.overlaySettings && typeof parsed.overlaySettings === "object"
        ? parsed.overlaySettings
        : { ...defaultOverlaySettings },
    threadSettings:
      parsed.threadSettings && typeof parsed.threadSettings === "object"
        ? parsed.threadSettings
        : { ...defaultThreadSetting },
    configVisibility: parsed.configVisibility ?? true,
    minVersion: parsed.minVersion ?? 0.5,
    latestSettings:
      parsed.latestSettings && typeof parsed.latestSettings === "object"
        ? parsed.latestSettings
        : { ...defaultLatestSettings },
  };

  debug && console.log("loadData result:", result);

  return result;
}
