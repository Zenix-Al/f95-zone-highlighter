export const CORE_EVENT = "f95ue:addons-dev-command";
export const ADDON_COMMAND_EVENT = "f95ue:addon-command";

export const PING_TIMEOUT_MS = 1500;
export const CORE_ACTION_TIMEOUT_MS = 2500;

export const LIBRARY_DB_NAME = "library";
export const LIBRARY_DB_VERSION = 3;
export const LIBRARY_STORE_NAME = "records";
export const LIBRARY_SCHEMA_MARKER_KEY = "schema-v3-complete";
export const LIBRARY_PIN_BACKFILL_MARKER_KEY = "pin-sort-v3-complete";
export const LIBRARY_STORAGE_KEY = "settings";
export const LIBRARY_LEGACY_KEY = "libraryRecords";
export const LIBRARY_MIGRATION_MARKER_KEY = "libraryMigrationV1Done";
export const LIBRARY_MANAGER_PAGE_SIZE = 50;
export const LIBRARY_IMPORT_RETRY_DELAY_MS = 1200;
export const LIBRARY_IMPORT_MAX_RETRIES = 3;
export const LIBRARY_SETTINGS_DEFAULT = {
  enabled: true,
  showPageButtons: true,
};
export const LIBRARY_AUTO_UPDATE_DEFAULTS = Object.freeze({
  enabled: true,
  intervalMs: 24 * 60 * 60 * 1000,
  spacingMs: 10_000,
  jitterMs: 2_000,
  timeoutMs: 30000,
  retryLimit: 2,
  sessionCap: 25,
  dailyCap: 100,
  leaseTtlMs: 90_000,
});

export const LIBRARY_INDEXES = [
  { name: "updatedAt", keyPath: "updatedAt" },
  { name: "userStatus", keyPath: "userStatus" },
  { name: "titleNormalized", keyPath: "titleNormalized" },
  { name: "prefix", keyPath: "prefix" },
  { name: "tags", keyPath: "tags", multiEntry: true },
  { name: "updateState", keyPath: "updateState" },
  { name: "personalStatus", keyPath: "personal.status" },
  { name: "personalRating", keyPath: "personal.rating" },
  { name: "personalLastPlayedAt", keyPath: "personal.lastPlayedAt" },
  { name: "lastThreadChangeAt", keyPath: "lastThreadChangeAt" },
  { name: "recordModifiedAt", keyPath: "recordModifiedAt" },
  {
    name: "pinnedUpdatedDesc",
    keyPath: ["pinRankDesc", "recordModifiedAt"],
  },
  {
    name: "pinnedUpdatedAsc",
    keyPath: ["pinRankAsc", "recordModifiedAt"],
  },
];

export const LIBRARY_DB_STORES = [
  { name: "records", keyPath: "threadId", indexes: LIBRARY_INDEXES },
  {
    name: "updates",
    keyPath: "id",
    indexes: [
      { name: "threadId", keyPath: "threadId" },
      { name: "observedAt", keyPath: "observedAt" },
      { name: "version", keyPath: "version" },
      { name: "threadObservedAt", keyPath: ["threadId", "observedAt"] },
    ],
  },
  {
    name: "activity",
    keyPath: "id",
    indexes: [
      { name: "threadId", keyPath: "threadId" },
      { name: "occurredAt", keyPath: "occurredAt" },
      { name: "type", keyPath: "type" },
      { name: "threadOccurredAt", keyPath: ["threadId", "occurredAt"] },
    ],
  },
  { name: "meta", keyPath: "key", indexes: [] },
];
