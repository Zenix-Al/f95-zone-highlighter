import {
  getDefaultConfig,
  sanitizeConfig,
  validateConfigSection,
} from "../config/schema.js";

export const CONFIG_MIGRATION_VERSION = 1;

// These are the only surface-level keys written by released core code.  The
// list is deliberately explicit so migration never becomes a storage scan.
export const LEGACY_SURFACE_KEYS = Object.freeze([
  "color",
  "overlaySettings",
  "threadSettings",
  "globalSettings",
  "latestSettings",
  "preferredTags",
  "excludedTags",
  "markedTags",
  "savedNotifID",
  "tags",
  "prefixes",
  "addons",
  "minVersion",
]);

export const LEGACY_CLEANUP_KEYS = Object.freeze([
  ...LEGACY_SURFACE_KEYS,
  "configVisibility",
  "metrics",
]);

export const CACHE_SECTION_KEYS = Object.freeze(["tags", "prefixes"]);

const LEGACY_THREAD_SETTINGS_KEYS = Object.freeze([
  "skipMaskedLink",
  "directDownloadLinks",
  "directDownloadPackages",
  "directDownloadHealth",
]);

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasValue(source, key) {
  return isRecord(source) && Object.hasOwn(source, key) && source[key] !== undefined;
}

function mergeRecords(...values) {
  const result = {};
  for (const value of values) {
    if (!isRecord(value)) continue;
    for (const [key, nextValue] of Object.entries(value)) {
      if (isRecord(result[key]) && isRecord(nextValue)) result[key] = mergeRecords(result[key], nextValue);
      else result[key] = clone(nextValue);
    }
  }
  return result;
}

function stripLegacyThreadKeys(value) {
  if (!isRecord(value)) return value;
  const next = { ...value };
  for (const key of LEGACY_THREAD_SETTINGS_KEYS) delete next[key];
  return next;
}

function normalizeHistoricalSections(surfaceValues) {
  const historical = {};
  for (const key of LEGACY_SURFACE_KEYS) {
    if (hasValue(surfaceValues, key)) historical[key] = clone(surfaceValues[key]);
  }

  if (isRecord(historical.threadSettings)) {
    historical.threadSettings = stripLegacyThreadKeys(historical.threadSettings);
  }

  // The root key was used by the earliest settings UI. Once the nested
  // setting existed, the nested value is authoritative.
  if (!hasValue(historical.globalSettings, "configVisibility") && hasValue(surfaceValues, "configVisibility")) {
    historical.globalSettings = {
      ...(isRecord(historical.globalSettings) ? historical.globalSettings : {}),
      configVisibility: Boolean(surfaceValues.configVisibility),
    };
  }

  if (typeof historical.minVersion === "number") {
    historical.latestSettings = mergeRecords(
      historical.latestSettings,
      { minVersion: historical.minVersion },
    );
    delete historical.minVersion;
  }

  return historical;
}

function mergeAddonTimes(merged, canonical, historical) {
  const entries = new Set([
    ...Object.keys(isRecord(canonical) ? canonical : {}),
    ...Object.keys(isRecord(historical) ? historical : {}),
  ]);
  for (const addonId of entries) {
    const current = isRecord(merged[addonId]) ? merged[addonId] : {};
    const old = isRecord(canonical?.[addonId]) ? canonical[addonId] : {};
    const legacy = isRecord(historical?.[addonId]) ? historical[addonId] : {};
    const installed = [old.installedSeenAt, legacy.installedSeenAt]
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0);
    const seen = [old.lastSeenAt, legacy.lastSeenAt]
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0);
    if (installed.length > 0) current.installedSeenAt = Math.min(...installed);
    if (seen.length > 0) current.lastSeenAt = Math.max(...seen);
    merged[addonId] = current;
  }
}

function mergeAddons(defaults, canonical, historical) {
  const canonicalRoot = isRecord(canonical) ? canonical : {};
  const historicalRoot = isRecord(historical) ? historical : {};
  const result = mergeRecords(defaults, canonicalRoot, historicalRoot);

  const canonicalByAddon = isRecord(canonicalRoot.byAddon) ? canonicalRoot.byAddon : {};
  const historicalByAddon = isRecord(historicalRoot.byAddon) ? historicalRoot.byAddon : {};
  result.byAddon = mergeRecords(defaults.byAddon, canonicalByAddon, historicalByAddon);
  const canonicalMeta = isRecord(canonicalRoot.installedMeta) ? canonicalRoot.installedMeta : {};
  const historicalMeta = isRecord(historicalRoot.installedMeta) ? historicalRoot.installedMeta : {};
  result.installedMeta = mergeRecords(defaults.installedMeta, canonicalMeta, historicalMeta);
  mergeAddonTimes(result.installedMeta, canonicalMeta, historicalMeta);

  if (hasValue(historicalRoot, "trustedIds")) result.trustedIds = clone(historicalRoot.trustedIds);
  else if (hasValue(canonicalRoot, "trustedIds")) result.trustedIds = clone(canonicalRoot.trustedIds);
  if (hasValue(historicalRoot, "service")) result.service = clone(historicalRoot.service);
  else if (hasValue(canonicalRoot, "service")) result.service = clone(canonicalRoot.service);
  return result;
}

function validateCache(section, value) {
  const validation = validateConfigSection(section, value, { mode: "tolerant" });
  return { value: validation.data[section], issues: validation.issues };
}

export function hasRecognizedHistoricalData(values) {
  return LEGACY_SURFACE_KEYS.some((key) => hasValue(values, key))
    || hasValue(values, "configVisibility");
}

export function buildMigrationPlan({
  canonicalData = null,
  backupData = null,
  surfaceValues = {},
  tagsCache = undefined,
  prefixesCache = undefined,
} = {}) {
  const defaults = getDefaultConfig();
  const canonical = isRecord(canonicalData) ? canonicalData : isRecord(backupData) ? backupData : {};
  const historical = normalizeHistoricalSections(surfaceValues);
  const candidate = mergeRecords(defaults, canonical, historical);
  candidate.addons = mergeAddons(defaults.addons, canonical.addons, historical.addons);

  const tagSource = hasValue(historical, "tags")
    ? historical.tags
    : tagsCache !== undefined
      ? tagsCache
      : canonical.tags;
  const prefixSource = hasValue(historical, "prefixes")
    ? historical.prefixes
    : prefixesCache !== undefined
      ? prefixesCache
      : canonical.prefixes;
  const tags = validateCache("tags", tagSource === undefined ? defaults.tags : tagSource);
  const prefixes = validateCache("prefixes", prefixSource === undefined ? defaults.prefixes : prefixSource);
  candidate.tags = tags.value;
  candidate.prefixes = prefixes.value;

  const validation = sanitizeConfig(candidate, { mode: "tolerant" });
  return {
    data: validation.data,
    caches: { tags: tags.value, prefixes: prefixes.value },
    issues: [...validation.issues, ...tags.issues, ...prefixes.issues],
    source: hasRecognizedHistoricalData(surfaceValues)
      ? "historical-surface"
      : isRecord(canonicalData)
        ? "canonical"
        : isRecord(backupData)
          ? "backup"
          : "defaults",
    usedHistorical: hasRecognizedHistoricalData(surfaceValues),
    conflicts: [],
  };
}

export function getCanonicalData(configValue) {
  const source = isRecord(configValue) ? configValue : {};
  const canonical = clone(source) || {};
  canonical.tags = [];
  canonical.prefixes = { items: [], categories: {} };
  return canonical;
}

export function isCurrentMigrationMarker(value) {
  return value === CONFIG_MIGRATION_VERSION
    || (isRecord(value) && value.version === CONFIG_MIGRATION_VERSION && value.completed === true);
}
