/* global __ADDON_ID__, __ADDON_NAME__, __ADDON_VERSION__, __ADDON_DESCRIPTION__, __ADDON_CAPABILITIES__, __ADDON_REQUIRES_CORE__, __ADDON_PAGE_SCOPES__, __ADDON_RUNTIME_MODE__, __ADDON_MATCHES__ */

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
export const LIBRARY_IMPORT_RETRY_DELAY_MS = 1200;
export const LIBRARY_IMPORT_MAX_RETRIES = 3;
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
    addonName: typeof __ADDON_NAME__ === "string" ? __ADDON_NAME__ : "Library Add-on",
    addonVersion: typeof __ADDON_VERSION__ === "string" ? __ADDON_VERSION__ : "0.1.0",
    addonDescription:
      typeof __ADDON_DESCRIPTION__ === "string"
        ? __ADDON_DESCRIPTION__
        : "Save thread snapshots into a personal library with quick page controls.",
    capabilities: Array.isArray(__ADDON_CAPABILITIES__) ? __ADDON_CAPABILITIES__ : [],
    requiresCore: Boolean(__ADDON_REQUIRES_CORE__),
    pageScopes: Array.isArray(__ADDON_PAGE_SCOPES__) ? __ADDON_PAGE_SCOPES__ : ["f95zone"],
    runtimeMode: typeof __ADDON_RUNTIME_MODE__ === "string" ? __ADDON_RUNTIME_MODE__ : "core-required",
    matches: Array.isArray(__ADDON_MATCHES__) ? __ADDON_MATCHES__ : ["*://f95zone.to/*"],
  };
}
