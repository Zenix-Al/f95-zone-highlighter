export const CONFIG_MIGRATION_VERSION = 1;
export const CONFIG_LEGACY_BRIDGE_VERSION = "5.1.2";

// Released pre-envelope builds wrote only these bounded surface keys. Detection
// is intentionally read-only and explicit; current releases never scan storage.
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

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasValue(source, key) {
  return isRecord(source) && Object.hasOwn(source, key) && source[key] !== undefined;
}

export function hasRecognizedHistoricalData(values) {
  return LEGACY_SURFACE_KEYS.some((key) => hasValue(values, key))
    || hasValue(values, "configVisibility");
}

function isLegacyConfigRoot(value) {
  return isRecord(value)
    && !Object.hasOwn(value, "data")
    && hasRecognizedHistoricalData(value);
}

export function classifyLegacyUpgrade({ canonical = null, backup = null, surfaceValues = {} } = {}) {
  const sources = [];
  if (isLegacyConfigRoot(canonical)) sources.push("canonical-root");
  if (isLegacyConfigRoot(backup)) sources.push("backup-root");
  if (hasRecognizedHistoricalData(surfaceValues)) sources.push("surface-keys");
  return Object.freeze({
    required: sources.length > 0,
    reason: sources.length > 0 ? "legacy_surface" : "",
    bridgeVersion: CONFIG_LEGACY_BRIDGE_VERSION,
    sources: Object.freeze(sources),
  });
}

export function getLegacyUpgradeMessage() {
  return `F95Zone Ultimate Enhancer preserved an older configuration that this release cannot safely convert. Install and open core v${CONFIG_LEGACY_BRIDGE_VERSION} once, then reinstall the current release. No stored configuration was changed.`;
}

export function getCanonicalData(configValue) {
  const source = isRecord(configValue) ? configValue : {};
  return JSON.parse(JSON.stringify({
    ...source,
    tags: [],
    prefixes: { items: [], categories: {} },
  }));
}

export function isCurrentMigrationMarker(value) {
  return value === CONFIG_MIGRATION_VERSION
    || (isRecord(value) && value.version === CONFIG_MIGRATION_VERSION && value.completed === true);
}
