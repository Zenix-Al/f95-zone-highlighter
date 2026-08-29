import { config } from "../config.js";
import {
  CONFIG_SCHEMA_VERSION,
  CONFIG_STORAGE_KEYS,
  isSupportedConfigVersion,
  migrateConfigSchema,
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
  classifyLegacyUpgrade,
  CONFIG_MIGRATION_VERSION,
  getCanonicalData,
  LEGACY_SURFACE_KEYS,
  hasRecognizedHistoricalData,
  isCurrentMigrationMarker,
} from "./configMigrationService.js";
import { storageAdapter } from "./storageAdapter.js";
import {
  getStorageFailureMessage,
  waitForStorageWriteAccess,
} from "./storageReadiness.js";

export const CONFIG_ENVELOPE_KEY = CONFIG_STORAGE_KEYS.current;
export const CONFIG_BACKUP_KEY = CONFIG_STORAGE_KEYS.backup;
export const CONFIG_RECOVERY_MARKER_KEY = CONFIG_STORAGE_KEYS.recovery;
export const CONFIG_MIGRATION_VERSION_KEY = CONFIG_STORAGE_KEYS.migrationVersion;
export const CONFIG_MIGRATION_LOCK_KEY = CONFIG_STORAGE_KEYS.migrationLock;
export const CONFIG_INITIALIZATION_LOCK_KEY = CONFIG_STORAGE_KEYS.initializationLock;
export const CONFIG_TAGS_CACHE_KEY = CONFIG_STORAGE_KEYS.tagsCache;
export const CONFIG_PREFIXES_CACHE_KEY = CONFIG_STORAGE_KEYS.prefixesCache;
export { CONFIG_SCHEMA_VERSION };
export const CONFIG_WRITER_ID = `tab:${Date.now()}:${Math.random().toString(16).slice(2)}`;

const CACHE_CONFIG_KEYS = Object.freeze({
  tags: CONFIG_TAGS_CACHE_KEY,
  prefixes: CONFIG_PREFIXES_CACHE_KEY,
});
const MIGRATION_LOCK_TTL_MS = 15000;
const INITIALIZATION_WAIT_MS = 15000;
let configLoadPromise = null;
let configUpdateQueue = Promise.resolve();

function cloneConfig(value) {
  return JSON.parse(JSON.stringify(value));
}

function storageValuesEqual(left, right) {
  const normalize = (value) => {
    if (Array.isArray(value)) return value.map(normalize);
    if (!isRecord(value)) return value;
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, normalize(value[key])]),
    );
  };
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

async function writeStorageValue(key, value) {
  const result = await storageAdapter.set(key, value);
  if (result === false) throw new Error("storage_write_returned_false");
  return result;
}

function cloneRuntimeSnapshot(value) {
  const source = isRecord(value) ? value : {};
  const snapshot = cloneConfig({
    ...source,
    tags: [],
    prefixes: { items: [], categories: {} },
  });
  snapshot.tags = source.tags;
  snapshot.prefixes = source.prefixes;
  return snapshot;
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
    await writeStorageValue(CONFIG_BACKUP_KEY, {
      ...cloneConfig(previousEnvelope),
      data: cloneConfig(getCanonicalData(previousEnvelope.data)),
    });
  }
  await writeStorageValue(CONFIG_ENVELOPE_KEY, cloneConfig(envelope));
}

async function markRecovery(marker) {
  try {
    await writeStorageValue(CONFIG_RECOVERY_MARKER_KEY, {
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
    migrated: Boolean(details.migrated),
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
  await writeStorageValue(CONFIG_MIGRATION_LOCK_KEY, {
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

async function acquireInitializationLock() {
  const existing = await storageAdapter.get(CONFIG_INITIALIZATION_LOCK_KEY, null);
  const expiresAt = Number(existing?.expiresAt) || 0;
  if (existing && existing.owner !== CONFIG_WRITER_ID && expiresAt > Date.now()) return false;
  await writeStorageValue(CONFIG_INITIALIZATION_LOCK_KEY, {
    owner: CONFIG_WRITER_ID,
    expiresAt: Date.now() + INITIALIZATION_WAIT_MS,
  });
  const confirmed = await storageAdapter.get(CONFIG_INITIALIZATION_LOCK_KEY, null);
  return confirmed?.owner === CONFIG_WRITER_ID;
}

async function releaseInitializationLock() {
  const current = await storageAdapter.get(CONFIG_INITIALIZATION_LOCK_KEY, null);
  if (current?.owner !== CONFIG_WRITER_ID) return;
  try { await storageAdapter.delete(CONFIG_INITIALIZATION_LOCK_KEY); } catch { /* stale lock expiry is the fallback */ }
}

async function hasFreshInstallEvidence(canonicalRaw) {
  if (canonicalRaw !== null && canonicalRaw !== undefined) return false;
  const [backupRaw, historicalRaw] = await Promise.all([
    storageAdapter.get(CONFIG_BACKUP_KEY, null),
    storageAdapter.getMany([...LEGACY_SURFACE_KEYS, "configVisibility"]),
  ]);
  const hasBackup = backupRaw !== null && backupRaw !== undefined;
  return !hasBackup && !hasRecognizedHistoricalData(historicalRaw);
}

async function readLegacyUpgradeEvidence(canonicalRaw) {
  const [backupRaw, surfaceValues] = await Promise.all([
    storageAdapter.get(CONFIG_BACKUP_KEY, null),
    storageAdapter.getMany([...LEGACY_SURFACE_KEYS, "configVisibility"]),
  ]);
  return {
    backupRaw,
    classification: classifyLegacyUpgrade({
      canonical: canonicalRaw,
      backup: backupRaw,
      surfaceValues,
    }),
  };
}

async function waitForFreshInitialization() {
  const deadline = Date.now() + INITIALIZATION_WAIT_MS;
  do {
    const marker = await storageAdapter.get(CONFIG_MIGRATION_VERSION_KEY, null);
    const canonicalRaw = await storageAdapter.get(CONFIG_ENVELOPE_KEY, null);
    if (isCurrentMigrationMarker(marker)) return loadFastPath(canonicalRaw);
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  return null;
}

async function initializeFreshStorage() {
  const acquired = await acquireInitializationLock();
  if (!acquired) return waitForFreshInitialization();
  try {
    const settledMarker = await storageAdapter.get(CONFIG_MIGRATION_VERSION_KEY, null);
    const settledCanonical = await storageAdapter.get(CONFIG_ENVELOPE_KEY, null);
    if (isCurrentMigrationMarker(settledMarker)) return loadFastPath(settledCanonical);
    if (settledCanonical !== null && settledCanonical !== undefined) return null;

    const defaults = getDefaultConfig();
    const validation = validateConfig(defaults, { mode: "strict" });
    if (!validation.valid) throw new Error("fresh_defaults_invalid");
    const envelope = buildEnvelope(validation.data, 1);
    await runMigrationStorageStep("fresh-canonical-write", () => persistEnvelope(envelope));
    const verified = await runMigrationStorageStep("fresh-canonical-verify", () => verifyCanonicalEnvelope(envelope));
    await runMigrationStorageStep("fresh-completion-marker-write", () => (
      writeStorageValue(CONFIG_MIGRATION_VERSION_KEY, CONFIG_MIGRATION_VERSION)
    ));
    const marker = await storageAdapter.get(CONFIG_MIGRATION_VERSION_KEY, null);
    if (!isCurrentMigrationMarker(marker)) throw new Error("fresh_completion_marker_verification_failed");
    await clearRecoveryMarker();
    const caches = await readCachePayloads();
    return applyLoadedConfig(makeLoadResult(mergeRuntimeCaches(validation.data, caches), {
      source: "fresh",
      status: "initialized",
      persisted: true,
      envelope: verified,
    }));
  } finally {
    await releaseInitializationLock();
  }
}

async function verifyCanonicalEnvelope(expected) {
  const stored = await storageAdapter.get(CONFIG_ENVELOPE_KEY, null);
  const validation = validateConfigEnvelope(stored);
  if (!validation.valid || !storageValuesEqual(stored, expected)) {
    throw new Error("canonical_verification_failed");
  }
  return stored;
}

async function runMigrationStorageStep(step, operation) {
  try {
    return await operation();
  } catch (error) {
    if (error && typeof error === "object") error.storageStep = String(step || "unknown");
    throw error;
  }
}

async function waitForSchemaMigration() {
  const deadline = Date.now() + MIGRATION_LOCK_TTL_MS;
  do {
    const settledRaw = await storageAdapter.get(CONFIG_ENVELOPE_KEY, null);
    if (settledRaw?.schemaVersion === CONFIG_SCHEMA_VERSION) return loadFastPath(settledRaw);
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  return null;
}

async function migrateSupportedSchema(canonicalRaw, canonical) {
  const acquired = await acquireMigrationLock();
  if (!acquired) {
    const settled = await waitForSchemaMigration();
    if (settled) return settled;
    return applyLoadedConfig(makeLoadResult(canonical.data, {
      source: "schema-migration-busy",
      status: "migration-busy",
      recovered: true,
      degraded: true,
      persisted: false,
      issues: canonical.issues,
    }));
  }

  try {
    const settledRaw = await storageAdapter.get(CONFIG_ENVELOPE_KEY, null);
    const settled = validateStoredEnvelope(settledRaw);
    if (settled.valid && settled.envelope.schemaVersion === CONFIG_SCHEMA_VERSION) {
      return loadFastPath(settledRaw);
    }
    if (!settled.valid || settled.envelope.schemaVersion !== 1) throw new Error("unsupported_config_schema");

    const migratedData = migrateConfigSchema(settled.data, settled.envelope.schemaVersion);
    const strict = validateConfig(migratedData, { mode: "strict" });
    if (!strict.valid) throw new Error("schema_migration_candidate_invalid");
    const envelope = buildEnvelope(strict.data, settled.envelope.revision + 1);
    if (settled.sanitized) {
      reportPersistenceHealth("SANITIZED", "Configuration migrated after dropping invalid or unknown fields.", {
        source: "schema-migration",
        issues: safeIssueSummary(settled.issues),
      });
    }
    await runMigrationStorageStep("schema-backup-write", () => (
      writeStorageValue(CONFIG_BACKUP_KEY, cloneConfig(settled.envelope))
    ));
    await runMigrationStorageStep("schema-canonical-write", () => (
      writeStorageValue(CONFIG_ENVELOPE_KEY, cloneConfig(envelope))
    ));
    const verified = await runMigrationStorageStep("schema-canonical-verify", () => verifyCanonicalEnvelope(envelope));
    await runMigrationStorageStep("schema-backup-verify", async () => {
      const backup = await storageAdapter.get(CONFIG_BACKUP_KEY, null);
      if (!storageValuesEqual(backup, settled.envelope)) throw new Error("schema_backup_verification_failed");
    });
    await clearRecoveryMarker();
    const caches = await readCachePayloads();
    return applyLoadedConfig(makeLoadResult(mergeRuntimeCaches(strict.data, caches), {
      source: "schema-migration",
      status: "migrated",
      migrated: true,
      persisted: true,
      degraded: settled.sanitized,
      issues: settled.issues,
      envelope: verified,
    }));
  } catch (error) {
    reportPersistenceHealth("SCHEMA_MIGRATION_FAILED", "Configuration schema migration could not be verified.", {
      source: "schema-migration",
      reason: error?.message || "schema_migration_failed",
      storageStep: error?.storageStep || "schema-migration",
    });
    await markRecovery({
      kind: "schema-migration-failed",
      source: "schema-migration",
      issues: error?.storageStep ? [{ path: "storage", code: error.storageStep }] : [],
    });
    const caches = await readCachePayloads();
    return applyLoadedConfig(makeLoadResult(mergeRuntimeCaches(canonical.data, caches), {
      source: "schema-migration",
      status: "migration-failed",
      recovered: true,
      degraded: true,
      persisted: false,
      issues: canonical.issues,
      envelope: canonicalRaw,
    }));
  } finally {
    await releaseMigrationLock();
  }
}

async function loadFastPath(canonicalRaw) {
  if (Number.isInteger(canonicalRaw?.schemaVersion) && canonicalRaw.schemaVersion > CONFIG_SCHEMA_VERSION) {
    const future = sanitizeConfig(canonicalRaw.data, { mode: "tolerant" });
    const caches = await readCachePayloads();
    return applyLoadedConfig(makeLoadResult(mergeRuntimeCaches(future.data, caches), {
      source: "canonical",
      status: "unsupported-newer",
      recovered: true,
      degraded: true,
      persisted: false,
      issues: [{ path: "schemaVersion", code: "unsupported" }],
      envelope: canonicalRaw,
    }));
  }
  const canonical = validateStoredEnvelope(canonicalRaw);
  if (!canonical.valid) {
    const backupRaw = await storageAdapter.get(CONFIG_BACKUP_KEY, null);
    const backup = validateStoredEnvelope(backupRaw);
    if (backup.valid) {
      const recoveredData = migrateConfigSchema(backup.data, backup.envelope.schemaVersion);
      const recoveredEnvelope = buildEnvelope(recoveredData, Math.max(Number(canonicalRaw?.revision) || 0, backup.envelope.revision) + 1);
      await persistEnvelope(recoveredEnvelope);
      await verifyCanonicalEnvelope(recoveredEnvelope);
      const caches = await readCachePayloads();
      return applyLoadedConfig(makeLoadResult(mergeRuntimeCaches(recoveredData, caches), {
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

  if (canonical.envelope.schemaVersion < CONFIG_SCHEMA_VERSION) {
    return migrateSupportedSchema(canonicalRaw, canonical);
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
    if (Number.isInteger(canonicalRaw?.schemaVersion) && canonicalRaw.schemaVersion > CONFIG_SCHEMA_VERSION) {
      return loadFastPath(canonicalRaw);
    }
    if (isCurrentMigrationMarker(marker)) return loadFastPath(canonicalRaw);

    const legacyEvidence = await readLegacyUpgradeEvidence(canonicalRaw);
    if (legacyEvidence.classification.required) {
      return applyLoadedConfig(makeLoadResult(defaults, {
        source: "legacy-surface",
        status: "upgrade-required",
        recovered: true,
        degraded: true,
        persisted: false,
        issues: legacyEvidence.classification.sources.map((source) => ({
          path: "storage",
          code: source,
        })),
      }));
    }

    const canonical = validateStoredEnvelope(canonicalRaw);
    const backup = validateStoredEnvelope(legacyEvidence.backupRaw);
    if (canonical.valid || backup.valid) return loadFastPath(canonicalRaw);

    if (await hasFreshInstallEvidence(canonicalRaw)) {
      const initialized = await initializeFreshStorage();
      if (initialized) return initialized;
    }

    return applyLoadedConfig(makeLoadResult(defaults, {
      source: "unknown-storage",
      status: "unrecoverable",
      recovered: true,
      degraded: true,
      persisted: false,
    }));
  } catch (error) {
    reportPersistenceHealth("LOAD_FAILED", "Configuration loading failed; sanitized defaults were loaded.", {
      source: "defaults",
      reason: error?.message || "load_failed",
      storageStep: error?.storageStep || "load",
    });
    await markRecovery({
      kind: "load-failed",
      source: "defaults",
      issues: error?.storageStep ? [{ path: "storage", code: error.storageStep }] : [],
    });
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
  if (!configLoadPromise) configLoadPromise = loadConfigInternal();
  return configLoadPromise;
}

async function ensureConfigReady() {
  await loadConfig();
  return waitForStorageWriteAccess();
}

function enqueueConfigUpdate(operation) {
  const queued = configUpdateQueue.then(operation, operation);
  configUpdateQueue = queued.catch(() => undefined);
  return queued;
}

function notReadyResult(origin, access = {}) {
  const code = String(access.reason || "storage_not_ready");
  return {
    committed: false,
    saved: [],
    failed: [{ code, message: getStorageFailureMessage(code) }],
    issues: [{ path: "", code, expected: "writable verified storage" }],
    origin,
    previousConfig: cloneRuntimeSnapshot(config),
    config: cloneRuntimeSnapshot(config),
  };
}

async function commitConfigNow(candidate, {
  origin = "local",
  preserveRuntimeCatalogs = false,
} = {}) {
  const storageAccess = await ensureConfigReady();
  if (!storageAccess.ok) return notReadyResult(origin, storageAccess);
  const validationInput = preserveRuntimeCatalogs
    ? {
        ...candidate,
        tags: [],
        prefixes: { items: [], categories: {} },
      }
    : candidate;
  const validation = validateConfig(validationInput, { mode: "strict" });
  if (!validation.valid) {
    reportPersistenceHealth("SAVE_FAILED", "Configuration commit was rejected by the schema.", {
      origin,
      issues: safeIssueSummary(validation.issues),
    });
    return { committed: false, saved: [], failed: [{ code: "validation", issues: safeIssueSummary(validation.issues) }], issues: validation.issues, origin };
  }

  if (preserveRuntimeCatalogs) {
    validation.data.tags = config.tags;
    validation.data.prefixes = config.prefixes;
  }

  const previousLiveConfig = cloneRuntimeSnapshot(config);
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
      config: cloneRuntimeSnapshot(applied.config),
      changedPaths: applied.changedPaths,
    };
  } catch (error) {
    reportPersistenceHealth("SAVE_FAILED", "Configuration commit failed before the live state was updated.", {
      origin,
      reason: error?.message || "storage_write_failed",
    });
    return {
      committed: false,
      saved: [],
      failed: [{ code: "storage_write_failed", message: getStorageFailureMessage("storage_write_failed") }],
      issues: [{ path: "", code: "storage_write_failed", expected: "persisted config", received: "storage_write_failed" }],
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
    const storageAccess = await ensureConfigReady();
    if (!storageAccess.ok) return notReadyResult(origin, storageAccess);

    const previousConfig = cloneRuntimeSnapshot(config);
    const draft = cloneRuntimeSnapshot(config);
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
    const catalogsReplaced = draft.tags !== config.tags || draft.prefixes !== config.prefixes;
    return commitConfigNow(draft, {
      origin,
      preserveRuntimeCatalogs: !catalogsReplaced,
    });
  });
}

async function saveConfigKeysNow(updates, { origin = "local" } = {}) {
  const storageAccess = await ensureConfigReady();
  if (!storageAccess.ok) return notReadyResult(origin, storageAccess);
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
      try {
        await writeStorageValue(CACHE_CONFIG_KEYS[section], cloneConfig(validation.data[section]));
      } catch (error) {
        reportPersistenceHealth("SAVE_FAILED", "Configuration cache write failed.", {
          origin,
          section,
          reason: error?.message || "storage_write_failed",
        });
        return {
          committed: false,
          saved: [],
          failed: [{ code: "storage_write_failed", message: getStorageFailureMessage("storage_write_failed") }],
          issues: [{ path: section, code: "storage_write_failed", expected: "persisted cache" }],
          origin,
          previousConfig: cloneRuntimeSnapshot(config),
          config: cloneRuntimeSnapshot(config),
        };
      }
    }
    const next = { ...cloneRuntimeSnapshot(config), ...Object.fromEntries(Object.entries(cachePatch).map(([section, value]) => [section, validateCachePayload(section, value).data[section]])) };
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

  const candidate = { ...cloneRuntimeSnapshot(config), ...corePatch };
  const result = await commitConfigNow(candidate, { origin, preserveRuntimeCatalogs: true });
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

export async function retryLoadData() {
  configLoadPromise = null;
  const result = await loadConfig();
  return result;
}
