export const CONFIG_STORAGE_KEYS = Object.freeze({
  current: "f95ue:config",
  backup: "f95ue:config:last-known-good",
  recovery: "f95ue:config:recovery",
});

export const CONFIG_SCHEMA_VERSION = 1;
export const CONFIG_MIGRATIONS = Object.freeze([]);
export const CONFIG_MIGRATION_COUNT = CONFIG_MIGRATIONS.length;

export function isCurrentConfigVersion(version) {
  return Number.isInteger(version) && version === CONFIG_SCHEMA_VERSION;
}

export function isSupportedConfigVersion(version) {
  return isCurrentConfigVersion(version);
}
