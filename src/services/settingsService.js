import {
  config,
  defaultAddonsApiThrottleSettings,
  defaultAddonsSettings,
  defaultAddonsServiceSettings,
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
import { CONFIG_SCHEMA_VERSION, sanitizeConfig, validateConfig } from "../config/schema.js";
import { storageAdapter } from "./storageAdapter.js";

export const CONFIG_ENVELOPE_KEY = "f95ue:config";
export const CONFIG_BACKUP_KEY = "f95ue:config:last-known-good";
const WRITER_ID = `tab:${Date.now()}:${Math.random().toString(16).slice(2)}`;

function cloneConfig(value) { return JSON.parse(JSON.stringify(value)); }

export async function commitConfig(candidate, { origin = "local" } = {}) {
  const validation = validateConfig(candidate, { mode: "strict" });
  if (!validation.valid) return { committed: false, issues: validation.issues, origin };
  const previousEnvelope = await storageAdapter.get(CONFIG_ENVELOPE_KEY, null);
  const revision = Math.max(0, Number(previousEnvelope?.revision) || 0) + 1;
  const envelope = { schemaVersion: CONFIG_SCHEMA_VERSION, revision, writerId: WRITER_ID, updatedAt: Date.now(), data: cloneConfig(validation.data) };
  if (previousEnvelope) await storageAdapter.set(CONFIG_BACKUP_KEY, previousEnvelope);
  await storageAdapter.set(CONFIG_ENVELOPE_KEY, envelope);
  Object.assign(config, cloneConfig(envelope.data));
  return { committed: true, origin, envelope, previousConfig: previousEnvelope?.data || null, config: cloneConfig(envelope.data) };
}

async function loadCanonicalEnvelope() {
  const envelope = await storageAdapter.get(CONFIG_ENVELOPE_KEY, null);
  if (!envelope || typeof envelope !== "object" || !envelope.data) return null;
  const validation = sanitizeConfig(envelope.data);
  if (validation.issues.length === 0) return { envelope, data: validation.data, recovered: false };
  const backup = await storageAdapter.get(CONFIG_BACKUP_KEY, null);
  if (backup?.data) {
    const recovered = sanitizeConfig(backup.data);
    if (recovered.issues.length === 0) return { envelope: backup, data: recovered.data, recovered: true };
  }
  return { envelope: null, data: validation.data, recovered: true };
}

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
  const source = normalizeObject(value);
  const merged = mergeWithDefault(source, defaultLatestSettings);
  merged.priorityWeights = mergeWithDefault(
    source.priorityWeights,
    defaultLatestSettings.priorityWeights,
  );
  merged.tagModifiers = mergeWithDefault(
    source.tagModifiers,
    defaultLatestSettings.tagModifiers,
  );
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

function clampFiniteNumber(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function sanitizeAddonsServiceSettings(value) {
  const source = normalizeObject(value);
  const apiThrottleSource = normalizeObject(source.apiThrottle);

  return {
    ...defaultAddonsServiceSettings,
    apiThrottle: {
      coreActionWindowMs: clampFiniteNumber(
        apiThrottleSource.coreActionWindowMs,
        defaultAddonsApiThrottleSettings.coreActionWindowMs,
        { min: 250, max: 60000 },
      ),
      coreActionRateMax: clampFiniteNumber(
        apiThrottleSource.coreActionRateMax,
        defaultAddonsApiThrottleSettings.coreActionRateMax,
        { min: 1, max: 1000 },
      ),
      coreActionMaxConcurrent: clampFiniteNumber(
        apiThrottleSource.coreActionMaxConcurrent,
        defaultAddonsApiThrottleSettings.coreActionMaxConcurrent,
        { min: 1, max: 100 },
      ),
    },
  };
}

function normalizeAddonsSettings(value) {
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
    service: sanitizeAddonsServiceSettings(source.service),
  };
}

function compactAddonsSettingsForStorage(value) {
  const normalized = normalizeAddonsSettings(value);
  const compacted = {};

  const defaultTrustedIds = JSON.stringify(defaultAddonsSettings.trustedIds);
  const normalizedTrustedIds = JSON.stringify(normalized.trustedIds);
  if (normalizedTrustedIds !== defaultTrustedIds) {
    compacted.trustedIds = [...normalized.trustedIds];
  }

  const byAddon = {};
  for (const [addonId, addonEntry] of Object.entries(normalized.byAddon)) {
    const state = normalizeObject(addonEntry?.state);
    if (Object.keys(state).length === 0) continue;
    byAddon[addonId] = { state };
  }
  if (Object.keys(byAddon).length > 0) {
    compacted.byAddon = byAddon;
  }

  const installedMeta = {};
  for (const [addonId, metaEntry] of Object.entries(normalized.installedMeta)) {
    const meta = normalizeObject(metaEntry);
    const nextMeta = {};

    const name = String(meta.name || "").trim();
    const version = String(meta.version || "").trim();
    const installedSeenAt = Number(meta.installedSeenAt || 0);
    const lastSeenAt = Number(meta.lastSeenAt || 0);

    if (name) nextMeta.name = name;
    if (version) nextMeta.version = version;
    if (Number.isFinite(installedSeenAt) && installedSeenAt > 0) {
      nextMeta.installedSeenAt = installedSeenAt;
    }
    if (Number.isFinite(lastSeenAt) && lastSeenAt > 0) {
      nextMeta.lastSeenAt = lastSeenAt;
    }

    if (Object.keys(nextMeta).length === 0) continue;
    installedMeta[addonId] = nextMeta;
  }
  if (Object.keys(installedMeta).length > 0) {
    compacted.installedMeta = installedMeta;
  }

  const normalizedApiThrottle = JSON.stringify(normalized.service.apiThrottle);
  const defaultApiThrottle = JSON.stringify(defaultAddonsServiceSettings.apiThrottle);
  if (normalizedApiThrottle !== defaultApiThrottle) {
    compacted.service = {
      apiThrottle: { ...normalized.service.apiThrottle },
    };
  }

  return compacted;
}

function sanitizePrefixCatalog(value) {
  const source = normalizeObject(value);
  return {
    items: normalizeArray(source.items),
    categories: normalizeObject(source.categories),
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
      return compactAddonsSettingsForStorage(value);
    default:
      return value;
  }
}

export async function saveConfigKeys(updates) {
  const candidate = { ...cloneConfig(config), ...updates };
  const committed = await commitConfig(candidate);
  if (committed.committed) return { saved: Object.keys(updates), failed: [], committed };
  // Compatibility fallback for legacy/partial state that has not yet gained full schema coverage.
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

/**
 * Deep merge for nested objects (used for latestSettings which has priorityWeights and tagModifiers)
 */
function deepMergeLatestSettings(saved, defaultObj) {
  const source = normalizeObject(saved);
  const result = { ...defaultObj };

  for (const key of Object.keys(source)) {
    if (key in result) {
      // For objects like priorityWeights and tagModifiers, do a shallow merge of their contents
      if (key === "priorityWeights" || key === "tagModifiers") {
        result[key] = mergeWithDefault(source[key], result[key]);
      } else {
        result[key] = source[key];
      }
    }
  }
  return result;
}

export async function loadData() {
  let parsed = {};
  try {
    const canonical = await loadCanonicalEnvelope();
    if (canonical) return canonical.data;
    parsed = await loadRawStorage([...Object.keys(config), ...LEGACY_STORAGE_KEYS]);
    parsed = await migrateLegacyConfigPayload(parsed);
  } catch (e) {
    debugLog("loadData", `Error loading data: ${e}`);
  }

  const result = {
    tags: normalizeArray(parsed.tags),
    prefixes: sanitizePrefixCatalog(parsed.prefixes),
    preferredTags: normalizeArray(parsed.preferredTags),
    excludedTags: normalizeArray(parsed.excludedTags),
    markedTags: normalizeArray(parsed.markedTags),
    color: mergeWithDefault(parsed.color, defaultColors),
    overlaySettings: mergeWithDefault(parsed.overlaySettings, defaultOverlaySettings),
    threadSettings: sanitizeThreadSettings(parsed.threadSettings),
    latestSettings: deepMergeLatestSettings(parsed.latestSettings, defaultLatestSettings),
    globalSettings: mergeWithDefault(parsed.globalSettings, defaultGlobalSettings),
    metrics: mergeWithDefault(parsed.metrics, defaultMetrics),
    addons: normalizeAddonsSettings(parsed.addons),
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
