export const CONFIG_STORAGE_KEYS = Object.freeze({
  current: "f95ue:config",
  backup: "f95ue:config:last-known-good",
  recovery: "f95ue:config:recovery",
  migrationVersion: "f95ue:config:migration-version",
  migrationLock: "f95ue:config:migration-lock",
  initializationLock: "f95ue:config:initialization-lock",
  tagsCache: "f95ue:cache:tags",
  prefixesCache: "f95ue:cache:prefixes",
});

export const CONFIG_SCHEMA_VERSION = 2;
export const CONFIG_MIGRATIONS = Object.freeze([
  Object.freeze({
    fromVersion: 1,
    toVersion: 2,
    migrate: (data) => JSON.parse(JSON.stringify(data)),
  }),
]);
export const CONFIG_MIGRATION_COUNT = CONFIG_MIGRATIONS.length;

export function isCurrentConfigVersion(version) {
  return Number.isInteger(version) && version === CONFIG_SCHEMA_VERSION;
}

export function isSupportedConfigVersion(version) {
  return Number.isInteger(version) && version >= 1 && version <= CONFIG_SCHEMA_VERSION;
}

export function migrateConfigSchema(data, fromVersion, toVersion = CONFIG_SCHEMA_VERSION) {
  let current = Number(fromVersion);
  let migrated = JSON.parse(JSON.stringify(data));
  while (current < toVersion) {
    const step = CONFIG_MIGRATIONS.find((entry) => entry.fromVersion === current);
    if (!step || step.toVersion <= current) throw new Error("unsupported_config_schema");
    migrated = step.migrate(migrated);
    current = step.toVersion;
  }
  if (current !== toVersion) throw new Error("unsupported_config_schema");
  return migrated;
}
