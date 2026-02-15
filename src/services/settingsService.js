import {
  config,
  defaultColors,
  defaultGlobalSettings,
  defaultLatestSettings,
  defaultOverlaySettings,
  defaultThreadSetting,
  defaultMetrics,
} from "../config";
import { debugLog } from "../core/logger";
import { isValidColor, isValidVersion } from "../utils/validators";
import { normalizeOverlayColorOrder } from "../features/latest-overlay/overlayOrder.js";

function sanitizeColorSection(value) {
  const merged = { ...defaultColors, ...(value || {}) };
  for (const [key, fallback] of Object.entries(defaultColors)) {
    if (!isValidColor(merged[key])) {
      merged[key] = fallback;
    }
  }
  return merged;
}

function sanitizeLatestSettings(value) {
  const merged = { ...defaultLatestSettings, ...(value || {}) };
  if (!isValidVersion(merged.minVersion)) {
    merged.minVersion = defaultLatestSettings.minVersion;
  }
  merged.latestOverlayColorOrder = normalizeOverlayColorOrder(merged.latestOverlayColorOrder);
  return merged;
}

function sanitizePersistedUpdate(key, value) {
  switch (key) {
    case "color":
      return sanitizeColorSection(value);
    case "latestSettings":
      return sanitizeLatestSettings(value);
    case "overlaySettings":
      return { ...defaultOverlaySettings, ...(value || {}) };
    case "threadSettings":
      return { ...defaultThreadSetting, ...(value || {}) };
    case "globalSettings":
      return { ...defaultGlobalSettings, ...(value || {}) };
    case "metrics":
      return { ...defaultMetrics, ...(value || {}) };
    default:
      return value;
  }
}

export async function saveConfigKeys(updates) {
  const promises = Object.entries(updates).map(([key, value]) => {
    return GM.setValue(key, sanitizePersistedUpdate(key, value));
  });
  await Promise.all(promises);
  debugLog("saveConfigKeys", `Config updated: ${JSON.stringify(Object.keys(updates))}`);
}

export async function loadData() {
  let parsed = {};
  try {
    // Violentmonkey/Tampermonkey/Greasemonkey differ slightly in storage APIs.
    // Prefer bulk `GM.getValues` if available; otherwise fall back to per-key `GM.getValue`.
    const keys = Object.keys(config);
    if (typeof GM.getValues === "function") {
      parsed = (await GM.getValues(keys)) ?? {};
    } else {
      // Fallback: fetch keys individually and assemble an object
      const entries = await Promise.all(
        keys.map(async (k) => {
          try {
            const v = await GM.getValue(k);
            return [k, v];
          } catch {
            return [k, undefined];
          }
        }),
      );
      parsed = entries.reduce((acc, [k, v]) => {
        if (typeof v !== "undefined") acc[k] = v;
        return acc;
      }, {});
    }
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

    metrics: mergeWithDefault(parsed.metrics, defaultMetrics),
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
  result.latestSettings.latestOverlayColorOrder = normalizeOverlayColorOrder(
    result.latestSettings.latestOverlayColorOrder,
  );
  debugLog("loadData", `loadData result:`, result);

  return result;
}
