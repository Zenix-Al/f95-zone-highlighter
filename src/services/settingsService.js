import { config } from "../config.js";
import {
  CONFIG_SCHEMA_VERSION,
  CONFIG_STORAGE_KEYS,
  isSupportedConfigVersion,
} from "../config/persistence.js";
import {
  getDefaultConfig,
  sanitizeConfig,
  validateConfig,
  validateConfigSection,
} from "../config/schema.js";
import { recordHealthEvent } from "../core/featureHealth.js";
import { applyConfigChange } from "./configChangeApplication.js";
import {
  buildMigrationPlan,
  CONFIG_MIGRATION_VERSION,
  getCanonicalData,
  LEGACY_CLEANUP_KEYS,
  LEGACY_SURFACE_KEYS,
  hasRecognizedHistoricalData,
  isCurrentMigrationMarker,
} from "./configMigrationService.js";
import { storageAdapter } from "./storageAdapter.js";

export const CONFIG_ENVELOPE_KEY = CONFIG_STORAGE_KEYS.current;
export const CONFIG_BACKUP_KEY = CONFIG_STORAGE_KEYS.backup;
export const CONFIG_RECOVERY_MARKER_KEY = CONFIG_STORAGE_KEYS.recovery;
export const CONFIG_MIGRATION_VERSION_KEY = CONFIG_STORAGE_KEYS.migrationVersion;
export const CONFIG_MIGRATION_LOCK_KEY = CONFIG_STORAGE_KEYS.migrationLock;
export const CONFIG_TAGS_CACHE_KEY = CONFIG_STORAGE_KEYS.tagsCache;
export const CONFIG_PREFIXES_CACHE_KEY = CONFIG_STORAGE_KEYS.prefixesCache;
export const CONFIG_WRITER_ID = `tab:${Date.now()}:${Math.random().toString(16).slice(2)}`;

const CACHE_CONFIG_KEYS = Object.freeze({
  tags: CONFIG_TAGS_CACHE_KEY,
  prefixes: CONFIG_PREFIXES_CACHE_KEY,
});
const MIGRATION_LOCK_TTL_MS = 15000;
let configLoadPromise = null;
let configReady = false;
let configUpdateQueue = Promise.resolve();

function cloneConfig(value) {
  return JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeIssueSummary(issues) {
  return (issues || []).slice(0, 8).map((entry) => ({
    path: String(entry?.path || ""),
    code: String(entry?.code || "validation"),
  }));
}

function reportPersistenceHealth(code, message, details = {}) {
  return recordHealthEvent({
    code: `CONFIG_${code}`,
    severity: code === "SAVE_FAILED" ? "error" : "warning",
    ownerId: "settingsService",
    subsystem: "config",
    message,
    details,
  });
}

function envelopeStructureIssues(envelope) {
  const issues = [];
  if (!isRecord(envelope)) return [{ path: "", code: "type" }];
  if (!Number.isInteger(envelope.schemaVersion) || envelope.schemaVersion < 0) issues.push({ path: "schemaVersion", code: "version" });
  if (!Number.isInteger(envelope.revision) || envelope.revision < 0) issues.push({ path: "revision", code: "revision" });
  if (typeof envelope.writerId !== "string" || envelope.writerId.trim() === "") issues.push({ path: "writerId", code: "required" });
  if (!Number.isFinite(envelope.updatedAt) || envelope.updatedAt < 0) issues.push({ path: "updatedAt", code: "timestamp" });
  if (!isRecord(envelope.data)) issues.push({ path: "data", code: "type" });
  return issues;
}

function validateStoredEnvelope(raw) {
  const structureIssues = envelopeStructureIssues(raw);
  if (structureIssues.length > 0) return { valid: false, issues: structureIssues };
  if (!isSupportedConfigVersion(raw.schemaVersion)) {
    return { valid: false, issues: [{ path: "schemaVersion", code: "unsupported" }] };
  }

  const validation = sanitizeConfig(raw.data, { mode: "tolerant" });
  return {
    valid: true,
    envelope: raw,
    data: validation.data,
    issues: validation.issues,
    sanitized: validation.issues.length > 0,
  };
}

export function validateConfigEnvelope(envelope) {
  const structureIssues = envelopeStructureIssues(envelope);
  if (structureIssues.length > 0) return { valid: false, issues: structureIssues, data: null };
  if (envelope.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    return { valid: false, issues: [{ path: "schemaVersion", code: "unsupported" }], data: null };
  }
  const validation = validateConfig(envelope.data, { mode: "strict" });
  const missingSections = Object.keys(getDefaultConfig())
    .filter((key) => !Object.hasOwn(envelope.data, key))
    .map((key) => ({ path: `data.${key}`, code: "required" }));
  return {
    valid: validation.valid && missingSections.length === 0,
    issues: [...validation.issues, ...missingSections],
    data: validation.data,
    envelope,
  };
}

function buildEnvelope(data, revision) {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    revision,
    writerId: CONFIG_WRITER_ID,
    updatedAt: Date.now(),
    data: cloneConfig(getCanonicalData(data)),
  };
}

async function persistEnvelope(envelope, previousEnvelope = null) {
  if (previousEnvelope) {
    await storageAdapter.set(CONFIG_BACKUP_KEY, {
      ...cloneConfig(previousEnvelope),
      data: cloneConfig(getCanonicalData(previousEnvelope.data)),
    });
  }
  await storageAdapter.set(CONFIG_ENVELOPE_KEY, cloneConfig(envelope));
}

async function markRecovery(marker) {
  try {
    await storageAdapter.set(CONFIG_RECOVERY_MARKER_KEY, {
      kind: String(marker.kind || "unknown"),
      source: String(marker.source || "unknown"),
      at: Date.now(),
      issues: safeIssueSummary(marker.issues),
    });
  } catch {
    // Recovery reporting must not prevent a usable fallback from loading.
  }
}

async function clearRecoveryMarker() {
  try { await storageAdapter.delete(CONFIG_RECOVERY_MARKER_KEY); } catch { /* best effort */ }
}

function makeLoadResult(data, details = {}) {
  return {
    loaded: true,
    status: details.status || "loaded",
    data: cloneConfig(data),
    config: cloneConfig(data),
    source: details.source || "canonical",
    recovered: Boolean(details.recovered),
    degraded: Boolean(details.degraded),
    migrated: false,
    persisted: details.persisted !== false,
    issues: safeIssueSummary(details.issues),
    envelope: details.envelope ? cloneConfig(details.envelope) : null,
  };
}

async function applyLoadedConfig(result) {
  if (result?.data && isRecord(result.data)) {
    const applied = applyConfigChange(result.data, {
      origin: `load:${result.source}`,
      notify: false,
    });
    await applied.effects;
  }
  return result;
}

function validateCachePayload(section, value) {
  return validateConfigSection(section, value, { mode: "strict" });
}

async function readCachePayloads() {
  const [tags, prefixes] = await Promise.all([
    storageAdapter.get(CONFIG_TAGS_CACHE_KEY, null),
    storageAdapter.get(CONFIG_PREFIXES_CACHE_KEY, null),
  ]);
  return { tags, prefixes };
}

function mergeRuntimeCaches(data, caches) {
  const runtime = cloneConfig(data);
  const tags = validateConfigSection("tags", caches?.tags, { mode: "tolerant" });
  const prefixes = validateConfigSection("prefixes", caches?.prefixes, { mode: "tolerant" });
  runtime.tags = tags.data.tags;
  runtime.prefixes = prefixes.data.prefixes;
  return runtime;
}

async function acquireMigrationLock() {
  const existing = await storageAdapter.get(CONFIG_MIGRATION_LOCK_KEY, null);
  const expiresAt = Number(existing?.expiresAt) || 0;
  if (existing && existing.owner !== CONFIG_WRITER_ID && expiresAt > Date.now()) return false;
  await storageAdapter.set(CONFIG_MIGRATION_LOCK_KEY, {
    owner: CONFIG_WRITER_ID,
    expiresAt: Date.now() + MIGRATION_LOCK_TTL_MS,
  });
  const confirmed = await storageAdapter.get(CONFIG_MIGRATION_LOCK_KEY, null);
  return confirmed?.owner === CONFIG_WRITER_ID;
}

async function releaseMigrationLock() {
  const current = await storageAdapter.get(CONFIG_MIGRATION_LOCK_KEY, null);
  if (current?.owner !== CONFIG_WRITER_ID) return;
  try { await storageAdapter.delete(CONFIG_MIGRATION_LOCK_KEY); } catch { /* stale lock expiry is the fallback */ }
}

async function writeCachePayloads(caches) {
  for (const [section, key] of Object.entries(CACHE_CONFIG_KEYS)) {
    const validation = validateCachePayload(section, caches?.[section]);
    if (!validation.valid) throw new Error(`invalid_cache_${section}`);
    await storageAdapter.set(key, cloneConfig(validation.data[section]));
  }
}

async function verifyCachePayloads(caches) {
  const stored = await readCachePayloads();
  for (const [section, expected] of Object.entries(caches || {})) {
    const validation = validateCachePayload(section, stored[section]);
    if (!validation.valid || JSON.stringify(validation.data[section]) !== JSON.stringify(expected)) {
      throw new Error(`cache_verification_failed_${section}`);
    }
  }
  return stored;
}

async function verifyCanonicalEnvelope(expected) {
  const stored = await storageAdapter.get(CONFIG_ENVELOPE_KEY, null);
  const validation = validateConfigEnvelope(stored);
  if (!validation.valid || JSON.stringify(stored) !== JSON.stringify(expected)) {
    throw new Error("canonical_verification_failed");
  }
  return stored;
}

async function cleanupLegacyKeys() {
  for (const key of LEGACY_CLEANUP_KEYS) {
    try { await storageAdapter.delete(key); } catch { /* cleanup is post-commit best effort */ }
  }
}

async function migrateStorage({ canonicalRaw, backupRaw }) {
  const historicalRaw = await storageAdapter.getMany([
    ...LEGACY_SURFACE_KEYS,
    "configVisibility",
  ]);
  const [cacheRaw, canonical, backup] = await Promise.all([
    readCachePayloads(),
    validateStoredEnvelope(canonicalRaw),
    validateStoredEnvelope(backupRaw),
  ]);
  const plan = buildMigrationPlan({
    canonicalData: canonical.valid ? canonicalRaw.data : null,
    backupData: backup.valid ? backupRaw.data : null,
    surfaceValues: historicalRaw,
    tagsCache: cacheRaw.tags,
    prefixesCache: cacheRaw.prefixes,
  });
  const hasCanonicalOrBackup = canonicalRaw !== null && canonicalRaw !== undefined
    || backupRaw !== null && backupRaw !== undefined;
  const hasCacheSource = cacheRaw.tags !== null && cacheRaw.tags !== undefined
    || cacheRaw.prefixes !== null && cacheRaw.prefixes !== undefined;
  if (!canonical.valid && !backup.valid && !hasRecognizedHistoricalData(historicalRaw)
    && !hasCacheSource && hasCanonicalOrBackup) {
    throw new Error("no_recoverable_source");
  }
  const strict = validateConfig(plan.data, { mode: "strict" });
  if (!strict.valid) throw new Error("migration_candidate_invalid");

  const cacheValidation = {
    tags: validateCachePayload("tags", plan.caches.tags),
    prefixes: validateCachePayload("prefixes", plan.caches.prefixes),
  };
  if (!cacheValidation.tags.valid || !cacheValidation.prefixes.valid) throw new Error("migration_cache_invalid");

  const previousEnvelope = canonical.valid ? canonicalRaw : null;
  const revisionHint = Math.max(
    Number(canonicalRaw?.revision) || 0,
    Number(backupRaw?.revision) || 0,
  );
  const envelope = buildEnvelope(strict.data, revisionHint + 1);
  let verified;
  try {
    await writeCachePayloads({
      tags: cacheValidation.tags.data.tags,
      prefixes: cacheValidation.prefixes.data.prefixes,
    });
    await persistEnvelope(envelope, previousEnvelope);
    await verifyCachePayloads({
      tags: cacheValidation.tags.data.tags,
      prefixes: cacheValidation.prefixes.data.prefixes,
    });
    verified = await verifyCanonicalEnvelope(envelope);
    if (!previousEnvelope) await storageAdapter.set(CONFIG_BACKUP_KEY, cloneConfig(verified));
    await verifyCanonicalEnvelope(verified);
    await storageAdapter.set(CONFIG_MIGRATION_VERSION_KEY, CONFIG_MIGRATION_VERSION);
    if (plan.source !== "defaults" || plan.usedHistorical) await cleanupLegacyKeys();
  } catch (error) {
    error.migrationPlan = plan;
    throw error;
  }

  return makeLoadResult(mergeRuntimeCaches(strict.data, cacheValidation), {
    source: plan.source === "defaults" ? "fresh" : "legacy-migration",
    status: "migrated",
    migrated: true,
    persisted: true,
    degraded: plan.issues.length > 0,
    issues: plan.issues,
    envelope: verified,
  });
}

async function loadFastPath(canonicalRaw) {
  const canonical = validateStoredEnvelope(canonicalRaw);
  if (!canonical.valid) {
    const backupRaw = await storageAdapter.get(CONFIG_BACKUP_KEY, null);
    const backup = validateStoredEnvelope(backupRaw);
    if (backup.valid) {
      const recoveredEnvelope = buildEnvelope(backup.data, Math.max(Number(canonicalRaw?.revision) || 0, backup.envelope.revision) + 1);
      await persistEnvelope(recoveredEnvelope);
      await verifyCanonicalEnvelope(recoveredEnvelope);
      const caches = await readCachePayloads();
      return applyLoadedConfig(makeLoadResult(mergeRuntimeCaches(backup.data, caches), {
        source: "backup",
        status: "recovered",
        recovered: true,
        degraded: true,
        persisted: true,
        issues: canonical.issues,
        envelope: recoveredEnvelope,
      }));
    }
    const defaults = getDefaultConfig();
    await markRecovery({ kind: "canonical-missing-after-migration", source: "defaults", issues: canonical.issues });
    return applyLoadedConfig(makeLoadResult(defaults, {
      source: "defaults",
      status: "defaults",
      recovered: true,
      degraded: true,
      persisted: false,
      issues: canonical.issues,
    }));
  }

  const caches = await readCachePayloads();
  const runtime = mergeRuntimeCaches(canonical.data, caches);
  if (canonical.sanitized) {
    reportPersistenceHealth("SANITIZED", "Configuration loaded after dropping invalid or unknown fields.", {
      source: "canonical",
      issues: safeIssueSummary(canonical.issues),
    });
  }
  return applyLoadedConfig(makeLoadResult(runtime, {
    source: "canonical",
    status: canonical.sanitized ? "sanitized" : "loaded",
    degraded: canonical.sanitized,
    persisted: true,
    issues: canonical.issues,
    envelope: canonical.envelope,
  }));
}

async function loadConfigInternal() {
  const defaults = getDefaultConfig();
  let canonicalRaw = null;
  try {
    const marker = await storageAdapter.get(CONFIG_MIGRATION_VERSION_KEY, null);
    canonicalRaw = await storageAdapter.get(CONFIG_ENVELOPE_KEY, null);
    if (isCurrentMigrationMarker(marker)) return loadFastPath(canonicalRaw);

    const acquired = await acquireMigrationLock();
    if (!acquired) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const settledMarker = await storageAdapter.get(CONFIG_MIGRATION_VERSION_KEY, null);
      const settledCanonical = await storageAdapter.get(CONFIG_ENVELOPE_KEY, null);
      if (isCurrentMigrationMarker(settledMarker)) return loadFastPath(settledCanonical);
      return applyLoadedConfig(makeLoadResult(defaults, {
        source: "migration-busy",
        status: "migration-busy",
        recovered: true,
        degraded: true,
        persisted: false,
      }));
    }

    try {
      const settledMarker = await storageAdapter.get(CONFIG_MIGRATION_VERSION_KEY, null);
      if (isCurrentMigrationMarker(settledMarker)) {
        const settledCanonical = await storageAdapter.get(CONFIG_ENVELOPE_KEY, null);
        return loadFastPath(settledCanonical);
      }
      const backupRaw = await storageAdapter.get(CONFIG_BACKUP_KEY, null);
      const migrated = await migrateStorage({ canonicalRaw, backupRaw });
      await clearRecoveryMarker();
      return applyLoadedConfig(migrated);
    } catch (error) {
      const canonical = validateStoredEnvelope(canonicalRaw);
      const fallback = canonical.valid ? canonical.data : defaults;
      reportPersistenceHealth("MIGRATION_FAILED", "Historical configuration migration could not be verified.", {
        source: "migration",
        reason: error?.message || "migration_failed",
      });
      await markRecovery({ kind: "migration-failed", source: "migration" });
      const migrationPlan = error?.migrationPlan;
      const fallbackData = migrationPlan?.data
        ? mergeRuntimeCaches(migrationPlan.data, migrationPlan.caches)
        : fallback;
      return applyLoadedConfig(makeLoadResult(fallbackData, {
        source: migrationPlan ? "legacy-migration" : canonical.valid ? "canonical" : "defaults",
        status: "migration-failed",
        recovered: true,
        degraded: true,
        persisted: false,
      }));
    } finally {
      await releaseMigrationLock();
    }
  } catch {
    reportPersistenceHealth("LOAD_FAILED", "Configuration loading failed; sanitized defaults were loaded.", { source: "defaults" });
    await markRecovery({ kind: "load-failed", source: "defaults" });
    return applyLoadedConfig(makeLoadResult(defaults, {
      source: "defaults",
      status: "defaults",
      recovered: true,
      degraded: true,
      persisted: false,
    }));
  }
}

export async function loadConfig() {
  if (!configLoadPromise) {
    configLoadPromise = loadConfigInternal().then((result) => {
      configReady = !["migration-failed", "migration-busy", "defaults"].includes(result?.status);
      return result;
    });
  }
  return configLoadPromise;
}

export function isConfigReady() {
  return configReady;
}

async function ensureConfigReady() {
  if (!configReady) await loadConfig();
  return configReady;
}

function enqueueConfigUpdate(operation) {
  const queued = configUpdateQueue.then(operation, operation);
  configUpdateQueue = queued.catch(() => undefined);
  return queued;
}

function notReadyResult(origin) {
  return {
    committed: false,
    saved: [],
    failed: [{ code: "config_not_ready" }],
    issues: [{ path: "", code: "config_not_ready", expected: "settled configuration migration" }],
    origin,
  };
}

async function commitConfigNow(candidate, { origin = "local" } = {}) {
  if (!(await ensureConfigReady())) {
    return notReadyResult(origin);
  }
  const validation = validateConfig(candidate, { mode: "strict" });
  if (!validation.valid) {
    reportPersistenceHealth("SAVE_FAILED", "Configuration commit was rejected by the schema.", {
      origin,
      issues: safeIssueSummary(validation.issues),
    });
    return { committed: false, saved: [], failed: [{ code: "validation", issues: safeIssueSummary(validation.issues) }], issues: validation.issues, origin };
  }

  const previousLiveConfig = cloneConfig(config);
  try {
    const latestRaw = await storageAdapter.get(CONFIG_ENVELOPE_KEY, null);
    const latestRevision = Math.max(0, Number(latestRaw?.revision) || 0);
    const previous = validateStoredEnvelope(latestRaw);
    const envelope = buildEnvelope(validation.data, latestRevision + 1);
    await persistEnvelope(envelope, previous.valid ? previous.envelope : null);

    const applied = applyConfigChange(validation.data, { origin });
    await applied.effects;
    await clearRecoveryMarker();
    return {
      committed: true,
      saved: Object.keys(validation.data),
      failed: [],
      origin,
      source: origin,
      envelope,
      revision: envelope.revision,
      revisionMetadata: {
        revision: envelope.revision,
        writerId: envelope.writerId,
        updatedAt: envelope.updatedAt,
      },
      previousConfig: previousLiveConfig,
      config: cloneConfig(applied.config),
      changedPaths: applied.changedPaths,
    };
  } catch {
    reportPersistenceHealth("SAVE_FAILED", "Configuration commit failed before the live state was updated.", { origin });
    return {
      committed: false,
      saved: [],
      failed: [{ code: "storage_error", message: "configuration storage write failed" }],
      issues: [{ path: "", code: "storage_error", expected: "persisted config", received: "storage_error" }],
      origin,
      previousConfig: previousLiveConfig,
      config: previousLiveConfig,
    };
  }
}

export function commitConfig(candidate, { origin = "local" } = {}) {
  return enqueueConfigUpdate(() => commitConfigNow(candidate, { origin }));
}

export function updateConfig(updater, { origin = "local" } = {}) {
  return enqueueConfigUpdate(async () => {
    if (typeof updater !== "function") {
      return {
        committed: false,
        saved: [],
        failed: [{ code: "invalid_updater" }],
        issues: [{ path: "", code: "invalid_updater", expected: "configuration updater function" }],
        origin,
      };
    }
    if (!(await ensureConfigReady())) return notReadyResult(origin);

    const previousConfig = cloneConfig(config);
    const draft = cloneConfig(config);
    const changed = updater(draft);
    if (changed === false) {
      return {
        committed: false,
        skipped: true,
        saved: [],
        failed: [],
        issues: [],
        origin,
        previousConfig,
        config: previousConfig,
        changedPaths: [],
      };
    }
    return commitConfigNow(draft, { origin });
  });
}

async function saveConfigKeysNow(updates, { origin = "local" } = {}) {
  if (!(await ensureConfigReady())) {
    return notReadyResult(origin);
  }
  const patch = isRecord(updates) ? cloneConfig(updates) : {};
  const cachePatch = {};
  const corePatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (Object.hasOwn(CACHE_CONFIG_KEYS, key)) cachePatch[key] = value;
    else corePatch[key] = value;
  }

  if (Object.keys(cachePatch).length > 0) {
    for (const [section, value] of Object.entries(cachePatch)) {
      const validation = validateCachePayload(section, value);
      if (!validation.valid) {
        return {
          committed: false,
          saved: [],
          failed: [{ code: "validation", issues: validation.issues }],
          issues: validation.issues,
          origin,
        };
      }
      await storageAdapter.set(CACHE_CONFIG_KEYS[section], cloneConfig(validation.data[section]));
    }
    const next = { ...cloneConfig(config), ...Object.fromEntries(Object.entries(cachePatch).map(([section, value]) => [section, validateCachePayload(section, value).data[section]])) };
    const applied = applyConfigChange(next, { origin });
    await applied.effects;
    if (Object.keys(corePatch).length === 0) {
      return {
        ...applied,
        committed: true,
        cacheCommitted: true,
        saved: Object.keys(cachePatch),
        failed: [],
        origin,
      };
    }
  }

  const candidate = { ...cloneConfig(config), ...corePatch };
  const result = await commitConfigNow(candidate, { origin });
  if (result.committed) return { ...result, saved: Object.keys(patch) };
  return { ...result, saved: [], failed: result.failed || [{ code: "commit_failed" }] };
}

export function saveConfigKeys(updates, { origin = "local" } = {}) {
  return enqueueConfigUpdate(() => saveConfigKeysNow(updates, { origin }));
}

export async function loadData() {
  const result = await loadConfig();
  return result.data;
}
