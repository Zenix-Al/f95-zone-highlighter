import { config } from "../config";
import { recordHealthEvent } from "../core/featureHealth.js";
import { applyConfigChange } from "./configChangeApplication.js";
import { LEGACY_STORAGE_KEYS, migrateConfigData, migrateLegacyConfigPayload } from "./configMigrationService.js";
import {
  CONFIG_SCHEMA_VERSION,
  getDefaultConfig,
  sanitizeConfig,
  validateConfig,
} from "../config/schema.js";
import { storageAdapter } from "./storageAdapter.js";

export const CONFIG_ENVELOPE_KEY = "f95ue:config";
export const CONFIG_BACKUP_KEY = "f95ue:config:last-known-good";
export const CONFIG_RECOVERY_MARKER_KEY = "f95ue:config:recovery";
export const CONFIG_WRITER_ID = `tab:${Date.now()}:${Math.random().toString(16).slice(2)}`;

const LEGACY_CONFIG_KEYS = Object.freeze(Object.keys(getDefaultConfig()));

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
    severity: code === "SAVE_FAILED" || code === "MIGRATION_FAILED" ? "error" : "warning",
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
  if (raw.schemaVersion > CONFIG_SCHEMA_VERSION) return { valid: false, issues: [{ path: "schemaVersion", code: "unsupported" }] };

  const validation = sanitizeConfig(raw.data, { mode: "tolerant" });
  if (validation.issues.length > 0) return { valid: false, issues: validation.issues };
  return { valid: true, envelope: raw, data: validation.data, issues: [] };
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
    data: cloneConfig(data),
  };
}

async function persistEnvelope(envelope, previousEnvelope = null) {
  if (previousEnvelope) await storageAdapter.set(CONFIG_BACKUP_KEY, cloneConfig(previousEnvelope));
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
    data: cloneConfig(data),
    config: cloneConfig(data),
    source: details.source || "defaults",
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
    const applied = applyConfigChange(result.data, { origin: `load:${result.source}` });
    await applied.effects;
  }
  return result;
}

async function loadLegacyConfig(rawValues, revisionHint = 0) {
  const migrated = migrateLegacyConfigPayload(rawValues);
  const validation = sanitizeConfig(migrated, { mode: "tolerant" });
  const envelope = buildEnvelope(validation.data, Math.max(0, Number(revisionHint) || 0) + 1);
  try {
    await persistEnvelope(envelope);
    for (const key of [...LEGACY_CONFIG_KEYS, ...LEGACY_STORAGE_KEYS]) {
      try { await storageAdapter.delete(key); } catch { /* compatibility cleanup is best effort */ }
    }
    await clearRecoveryMarker();
    return makeLoadResult(validation.data, {
      source: "legacy-migration",
      migrated: true,
      persisted: true,
      issues: validation.issues,
      envelope,
    });
  } catch {
    reportPersistenceHealth("MIGRATION_FAILED", "Legacy configuration migration could not be persisted.", {
      source: "legacy",
      issues: safeIssueSummary(validation.issues),
    });
    await markRecovery({ kind: "migration-failed", source: "legacy", issues: validation.issues });
    return makeLoadResult(validation.data, {
      source: "legacy-migration",
      migrated: true,
      persisted: false,
      degraded: true,
      issues: validation.issues,
    });
  }
}

export async function loadConfig({ migrations } = {}) {
  const defaults = getDefaultConfig();
  let canonicalRaw = null;

  try {
    canonicalRaw = await storageAdapter.get(CONFIG_ENVELOPE_KEY, null);
    const canonical = validateStoredEnvelope(canonicalRaw);
    if (canonical.valid) {
      if (canonical.envelope.schemaVersion < CONFIG_SCHEMA_VERSION) {
        try {
          const migratedData = migrateConfigData(canonical.data, canonical.envelope.schemaVersion, migrations);
          const validation = validateConfig(migratedData, { mode: "strict" });
          if (!validation.valid) throw new Error("migration_output_invalid");
          const migratedEnvelope = buildEnvelope(validation.data, canonical.envelope.revision + 1);
          await persistEnvelope(migratedEnvelope, canonical.envelope);
          await clearRecoveryMarker();
          return applyLoadedConfig(makeLoadResult(validation.data, {
            source: "canonical-migration",
            migrated: true,
            persisted: true,
            envelope: migratedEnvelope,
          }));
        } catch {
          reportPersistenceHealth("MIGRATION_FAILED", "Canonical configuration migration failed.", {
            source: "canonical",
            schemaVersion: canonical.envelope.schemaVersion,
          });
          await markRecovery({ kind: "migration-failed", source: "canonical" });
          return applyLoadedConfig(makeLoadResult(canonical.data, {
            source: "canonical",
            recovered: true,
            degraded: true,
            persisted: false,
            migrated: false,
            envelope: canonical.envelope,
          }));
        }
      } else {
        await clearRecoveryMarker();
        return applyLoadedConfig(makeLoadResult(canonical.data, {
          source: "canonical",
          envelope: canonical.envelope,
        }));
      }
    }

    const backupRaw = await storageAdapter.get(CONFIG_BACKUP_KEY, null);
    const backup = validateStoredEnvelope(backupRaw);
    if (backup.valid) {
      const recoveredEnvelope = buildEnvelope(backup.data, Math.max(Number(canonicalRaw?.revision) || 0, backup.envelope.revision) + 1);
      try {
        await persistEnvelope(recoveredEnvelope);
        await clearRecoveryMarker();
      } catch {
        await markRecovery({ kind: "canonical-recovery-persist-failed", source: "backup" });
      }
      reportPersistenceHealth("RECOVERED", "Canonical configuration was recovered from last-known-good data.", {
        source: "backup",
        issues: safeIssueSummary(validateStoredEnvelope(canonicalRaw).issues),
      });
      return applyLoadedConfig(makeLoadResult(backup.data, {
        source: "backup",
        recovered: true,
        degraded: true,
        persisted: true,
        issues: validateStoredEnvelope(canonicalRaw).issues,
        envelope: recoveredEnvelope,
      }));
    }

    const rawValues = await storageAdapter.getMany([...LEGACY_CONFIG_KEYS, ...LEGACY_STORAGE_KEYS]);
    const legacyValues = Object.fromEntries(Object.entries(rawValues || {}).filter(([, value]) => value !== undefined));
    if ((canonicalRaw === null || typeof canonicalRaw === "undefined") && Object.keys(legacyValues).length > 0) {
      return applyLoadedConfig(await loadLegacyConfig(legacyValues, Math.max(Number(canonicalRaw?.revision) || 0, Number(backupRaw?.revision) || 0)));
    }

    const canonicalIssues = validateStoredEnvelope(canonicalRaw).issues;
    const backupIssues = validateStoredEnvelope(backupRaw).issues;
    const issues = [...canonicalIssues, ...backupIssues];
    reportPersistenceHealth("CORRUPT", "No valid canonical or backup configuration was available; defaults were loaded.", {
      source: "defaults",
      issues: safeIssueSummary(issues),
    });
    await markRecovery({ kind: "corrupt", source: "defaults", issues });
    return applyLoadedConfig(makeLoadResult(defaults, {
      source: "defaults",
      recovered: true,
      degraded: true,
      persisted: false,
      issues,
    }));
  } catch {
    reportPersistenceHealth("LOAD_FAILED", "Configuration loading failed; sanitized defaults were loaded.", { source: "defaults" });
    await markRecovery({ kind: "load-failed", source: "defaults" });
    return applyLoadedConfig(makeLoadResult(defaults, {
      source: "defaults",
      recovered: true,
      degraded: true,
      persisted: false,
    }));
  }
}

export async function commitConfig(candidate, { origin = "local" } = {}) {
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

export async function saveConfigKeys(updates, { origin = "local" } = {}) {
  const patch = isRecord(updates) ? cloneConfig(updates) : {};
  const candidate = { ...cloneConfig(config), ...patch };
  const result = await commitConfig(candidate, { origin });
  if (result.committed) return { ...result, saved: Object.keys(patch) };
  return { ...result, saved: [], failed: result.failed || [{ code: "commit_failed" }] };
}

export async function loadData() {
  const result = await loadConfig();
  return result.data;
}
