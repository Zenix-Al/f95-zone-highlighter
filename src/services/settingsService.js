import {
  config,
  defaultAddonsSettings,
  defaultColors,
  defaultGlobalSettings,
  defaultLatestSettings,
  defaultMetrics,
  defaultOverlaySettings,
  defaultThreadSetting,
} from "../config";
import { debugLog } from "../core/logger";
import { normalizeOverlayColorOrder } from "../features/latest-overlay/overlayOrder.js";
import { normalizeArray, normalizeObject } from "../utils/objectPath.js";
import { isValidColor, isValidVersion } from "../utils/validators";
import { LEGACY_STORAGE_KEYS, migrateLegacyConfigPayload } from "./configMigrationService.js";

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
  const source = normalizeObject(value);
  const merged = { ...defaultThreadSetting };
  for (const key of Object.keys(defaultThreadSetting)) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      merged[key] = source[key];
    }
  }
  return merged;
}

function sanitizeAddonsSettings(value) {
  const source = normalizeObject(value);
  const byAddonSource = normalizeObject(source.byAddon);
  const installedMetaSource = normalizeObject(source.installedMeta);
  const trustedIdsSource = normalizeArray(source.trustedIds);
  const byAddon = {};
  const installedMeta = {};
  const sanitizedTrustedIds = [
    ...new Set(
      trustedIdsSource
        .map((entry) =>
          String(entry || "")
            .trim()
            .replace(/[^a-z0-9_-]+/gi, "-")
            .replace(/^-+|-+$/g, "")
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];

  const trustedIds =
    sanitizedTrustedIds.length > 0 ? sanitizedTrustedIds : [...defaultAddonsSettings.trustedIds];

  for (const [addonId, addonData] of Object.entries(byAddonSource)) {
    const normalizedAddonId = String(addonId || "")
      .trim()
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    if (!normalizedAddonId) continue;

    const entry = normalizeObject(addonData);
    byAddon[normalizedAddonId] = {
      state: normalizeObject(entry.state),
    };
  }

  for (const [addonId, metaValue] of Object.entries(installedMetaSource)) {
    const normalizedAddonId = String(addonId || "")
      .trim()
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    if (!normalizedAddonId) continue;

    const meta = normalizeObject(metaValue);
    const lastSeenAt = Number(meta.lastSeenAt || 0);
    const installedSeenAt = Number(meta.installedSeenAt || 0);

    installedMeta[normalizedAddonId] = {
      name: String(meta.name || "").trim(),
      version: String(meta.version || "").trim(),
      installedSeenAt: Number.isFinite(installedSeenAt) ? installedSeenAt : 0,
      lastSeenAt: Number.isFinite(lastSeenAt) ? lastSeenAt : 0,
    };
  }

  return {
    ...defaultAddonsSettings,
    trustedIds,
    byAddon,
    installedMeta,
  };
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
    case "addons":
      return sanitizeAddonsSettings(value);
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

async function loadRawStorage(keys) {
  if (typeof GM.getValues === "function") {
    return (await GM.getValues(keys)) ?? {};
  }
  const entries = await Promise.all(
    keys.map(async (k) => {
      try {
        return [k, await GM.getValue(k)];
      } catch {
        return [k, undefined];
      }
    }),
  );
  return Object.fromEntries(entries.filter(([, v]) => v !== undefined));
}

function mergeWithDefault(saved, defaultObj) {
  const source = normalizeObject(saved);
  const result = { ...defaultObj };
  for (const key of Object.keys(source)) {
    if (key in result) result[key] = source[key];
  }
  return result;
}

export async function loadData() {
  let parsed = {};
  try {
    parsed = await loadRawStorage([...Object.keys(config), ...LEGACY_STORAGE_KEYS]);
    parsed = await migrateLegacyConfigPayload(parsed);
  } catch (e) {
    debugLog("loadData", `Error loading data: ${e}`);
  }

  const result = {
    tags: normalizeArray(parsed.tags),
    preferredTags: normalizeArray(parsed.preferredTags),
    excludedTags: normalizeArray(parsed.excludedTags),
    markedTags: normalizeArray(parsed.markedTags),
    color: mergeWithDefault(parsed.color, defaultColors),
    overlaySettings: mergeWithDefault(parsed.overlaySettings, defaultOverlaySettings),
    threadSettings: sanitizeThreadSettings(parsed.threadSettings),
    latestSettings: mergeWithDefault(parsed.latestSettings, defaultLatestSettings),
    globalSettings: mergeWithDefault(parsed.globalSettings, defaultGlobalSettings),
    metrics: mergeWithDefault(parsed.metrics, defaultMetrics),
    addons: sanitizeAddonsSettings(parsed.addons),
    savedNotifID: parsed.savedNotifID || null,
  };

  if (typeof result.latestSettings.minVersion !== "number") {
    result.latestSettings.minVersion = defaultLatestSettings.minVersion;
  }
  result.latestSettings.latestOverlayColorOrder = normalizeOverlayColorOrder(
    result.latestSettings.latestOverlayColorOrder,
  );
  debugLog("loadData", `loadData result:`, { result, level: "info" });

  return result;
}
