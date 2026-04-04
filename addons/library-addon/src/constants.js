/* global __ADDON_ID__, __ADDON_CAPABILITIES__, __ADDON_REQUIRES_CORE__ */

export const CORE_EVENT = "f95ue:addons-dev-command";
export const ADDON_COMMAND_EVENT = "f95ue:addon-command";

export const PING_TIMEOUT_MS = 1500;
export const CORE_ACTION_TIMEOUT_MS = 2500;

export const LIBRARY_DB_NAME = "library";
export const LIBRARY_STORE_NAME = "records";
export const LIBRARY_STORAGE_KEY = "settings";
export const LIBRARY_LEGACY_KEY = "libraryRecords";
export const LIBRARY_MIGRATION_MARKER_KEY = "libraryMigrationV1Done";
export const LIBRARY_MANAGER_PAGE_SIZE = 50;
export const LIBRARY_SETTINGS_DEFAULT = {
  enabled: true,
  showPageButtons: true,
};

export const LIBRARY_INDEXES = [
  { name: "updatedAt", keyPath: "updatedAt" },
  { name: "userStatus", keyPath: "userStatus" },
  { name: "titleNormalized", keyPath: "titleNormalized" },
  { name: "prefix", keyPath: "prefix" },
  { name: "tags", keyPath: "tags", multiEntry: true },
];

export function getRuntimeConfig() {
  return {
    addonId: typeof __ADDON_ID__ === "string" ? __ADDON_ID__ : "library-addon",
    capabilities: Array.isArray(__ADDON_CAPABILITIES__) ? __ADDON_CAPABILITIES__ : [],
    requiresCore: Boolean(__ADDON_REQUIRES_CORE__),
  };
}
