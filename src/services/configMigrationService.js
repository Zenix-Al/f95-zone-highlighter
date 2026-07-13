import { normalizeObject } from "../utils/objectPath.js";
import { CONFIG_SCHEMA_VERSION, validateConfig } from "../config/schema.js";

const LEGACY_THREAD_SETTINGS_KEYS = Object.freeze([
  "skipMaskedLink",
  "directDownloadLinks",
  "directDownloadPackages",
  "directDownloadHealth",
]);

export const LEGACY_STORAGE_KEYS = Object.freeze(["minVersion"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function dropLegacyThreadSettings(threadSettings) {
  const source = normalizeObject(threadSettings);
  const next = { ...source };
  let changed = false;

  for (const key of LEGACY_THREAD_SETTINGS_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
    delete next[key];
    changed = true;
  }

  return { changed, next };
}

/**
 * Pure legacy-shape migration. Storage writes and key cleanup belong to the
 * settings repository, after the new canonical envelope has been persisted.
 */
export function migrateLegacyConfigPayload(parsed) {
  const source = normalizeObject(parsed);
  const next = { ...source };

  const threadSettingsResult = dropLegacyThreadSettings(source.threadSettings);
  if (threadSettingsResult.changed) next.threadSettings = threadSettingsResult.next;

  if (typeof source.minVersion === "number") {
    const latestSettings = normalizeObject(source.latestSettings);
    if (typeof latestSettings.minVersion === "undefined") {
      next.latestSettings = { ...latestSettings, minVersion: source.minVersion };
    }
    delete next.minVersion;
  }

  const validation = validateConfig(next, { mode: "migration", partial: true });
  return validation.valid ? validation.data : clone(next);
}

// Version 1 is the current schema. The v0-to-v1 step makes the migration
// runner explicit and gives future migrations the same ordered contract.
const CONFIG_MIGRATIONS = Object.freeze({
  1: migrateLegacyConfigPayload,
});

export function migrateConfigData(data, fromVersion = 0, migrations = CONFIG_MIGRATIONS) {
  let working = clone(normalizeObject(data));
  const startingVersion = Number(fromVersion);
  if (!Number.isInteger(startingVersion) || startingVersion < 0) {
    throw new Error("invalid_schema_version");
  }

  for (let targetVersion = startingVersion + 1; targetVersion <= CONFIG_SCHEMA_VERSION; targetVersion += 1) {
    const migration = migrations[targetVersion];
    if (typeof migration !== "function") throw new Error(`missing_migration_${targetVersion}`);
    working = clone(migration(working));
    const validation = validateConfig(working, { mode: "migration", partial: true });
    if (!validation.valid) throw new Error(`migration_validation_failed_${targetVersion}`);
    working = { ...working, ...validation.data };
  }

  return working;
}
