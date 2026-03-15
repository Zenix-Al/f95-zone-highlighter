import {
  config,
  createDefaultDirectDownloadHealth,
  defaultColors,
  defaultDirectDownloadPackages,
  defaultGlobalSettings,
  defaultLatestSettings,
  defaultOverlaySettings,
  defaultThreadSetting,
  defaultMetrics,
} from "../config";
import { debugLog } from "../core/logger";
import { isValidColor, isValidVersion } from "../utils/validators";
import { normalizeOverlayColorOrder } from "../features/latest-overlay/overlayOrder.js";
import { normalizeDirectDownloadHealthEntry } from "../utils/normalization.js";
import { normalizeArray, normalizeObject } from "../utils/objectPath.js";
import {
  createInactiveProcessingDownloadTrigger,
  isProcessingDownloadTriggerActive,
  normalizeProcessingDownloadTrigger,
} from "../utils/processingDownloadTrigger.js";

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

function sanitizeThreadSettings(value) {
  const sanitizeDirectDownloadHealth = (input) => {
    const defaults = createDefaultDirectDownloadHealth(defaultDirectDownloadPackages);
    const source = normalizeObject(input);
    const result = {};
    for (const key of Object.keys(defaults)) {
      result[key] = normalizeDirectDownloadHealthEntry(source[key], defaults[key]);
    }
    return result;
  };
  const source = normalizeObject(value);
  const merged = { ...defaultThreadSetting, ...source };
  const incomingPackages = normalizeObject(source.directDownloadPackages);
  merged.directDownloadPackages = {
    ...defaultDirectDownloadPackages,
    ...incomingPackages,
  };
  for (const key of Object.keys(defaultDirectDownloadPackages)) {
    merged.directDownloadPackages[key] = Boolean(merged.directDownloadPackages[key]);
  }
  const incomingHealth = normalizeObject(source.directDownloadHealth);
  merged.directDownloadHealth = sanitizeDirectDownloadHealth(incomingHealth);
  for (const key of Object.keys(defaultDirectDownloadPackages)) {
    if (merged.directDownloadHealth[key]?.autoDisabled) {
      merged.directDownloadPackages[key] = false;
    }
  }
  return merged;
}

function sanitizePersistedUpdate(key, value) {
  switch (key) {
    case "color":
      return sanitizeColorSection(value);
    case "latestSettings":
      return sanitizeLatestSettings(value);
    case "overlaySettings":
      return { ...defaultOverlaySettings, ...normalizeObject(value) };
    case "threadSettings":
      return sanitizeThreadSettings(value);
    case "globalSettings":
      return { ...defaultGlobalSettings, ...normalizeObject(value) };
    case "metrics":
      return { ...defaultMetrics, ...normalizeObject(value) };
    case "processingDownload":
      return normalizeProcessingDownloadTrigger(value);
    default:
      return value;
  }
}

export async function saveConfigKeys(updates) {
  const entries = Object.entries(updates);
  if (entries.length === 0) {
    return { saved: [], failed: [] };
  }
  const results = await Promise.allSettled(
    entries.map(([key, value]) => GM.setValue(key, sanitizePersistedUpdate(key, value))),
  );
  const saved = [];
  const failed = [];
  for (let i = 0; i < results.length; i++) {
    const key = entries[i][0];
    const result = results[i];
    if (result.status === "fulfilled") {
      saved.push(key);
    } else {
      failed.push({
        key,
        reason: result.reason,
      });
    }
  }
  if (saved.length > 0) {
    debugLog("saveConfigKeys", `Config updated: ${JSON.stringify(saved)}`);
  }
  if (failed.length > 0) {
    console.warn(
      "[saveConfigKeys] Some settings failed to persist:",
      failed.map((item) => item.key),
    );
    debugLog("saveConfigKeys", "Failed to persist settings keys", {
      data: failed,
      level: "warn",
    });
  }
  return { saved, failed };
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
    const source = normalizeObject(saved);
    const result = { ...defaultObj }; // start with defaults
    Object.keys(source).forEach((key) => {
      if (key in result) {
        result[key] = source[key]; // only override if key exists in default
      }
      // ignore unknown keys (future cleanup)
    });
    return result;
  };

  const hasLegacyProcessingDownload = typeof parsed.processingDownload === "boolean";
  let processingDownload = normalizeProcessingDownloadTrigger(parsed.processingDownload);
  if (hasLegacyProcessingDownload) {
    try {
      await GM.setValue("processingDownload", processingDownload);
    } catch {
      // best-effort migration write
    }
  }
  if (processingDownload.active && !isProcessingDownloadTriggerActive(processingDownload)) {
    processingDownload = createInactiveProcessingDownloadTrigger();
    try {
      await GM.setValue("processingDownload", processingDownload);
    } catch {
      // best-effort migration cleanup
    }
  }

  const result = {
    tags: normalizeArray(parsed.tags),
    preferredTags: normalizeArray(parsed.preferredTags),
    excludedTags: normalizeArray(parsed.excludedTags),

    color: mergeWithDefault(parsed.color, defaultColors),

    overlaySettings: mergeWithDefault(parsed.overlaySettings, defaultOverlaySettings),

    threadSettings: sanitizeThreadSettings(parsed.threadSettings),

    latestSettings: mergeWithDefault(parsed.latestSettings, defaultLatestSettings),
    globalSettings: mergeWithDefault(parsed.globalSettings, defaultGlobalSettings),

    metrics: mergeWithDefault(parsed.metrics, defaultMetrics),
    savedNotifID: parsed.savedNotifID || null,
    processingDownload,
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
