/* global __ADDON_ID__, __ADDON_NAME__, __ADDON_VERSION__, __ADDON_DESCRIPTION__, __ADDON_CAPABILITIES__, __ADDON_REQUIRES_CORE__ */

export const CORE_EVENT = "f95ue:addons-dev-command";
export const ADDON_COMMAND_EVENT = "f95ue:addon-command";

export const PING_TIMEOUT_MS = 1500;
export const CORE_ACTION_TIMEOUT_MS = 2500;

export const FILTER_PRESETS_STORAGE_KEY = "presets";
export const FILTER_SETTINGS_STORAGE_KEY = "settings";

export const FILTER_SETTINGS_DEFAULT = {
  enabled: true,
  showPageButton: true,
};

export function getRuntimeConfig() {
  return {
    addonId: typeof __ADDON_ID__ === "string" ? __ADDON_ID__ : "latest-filters-addon",
    addonName: typeof __ADDON_NAME__ === "string" ? __ADDON_NAME__ : "Latest Filters Add-on",
    addonVersion: typeof __ADDON_VERSION__ === "string" ? __ADDON_VERSION__ : "0.1.0",
    addonDescription:
      typeof __ADDON_DESCRIPTION__ === "string"
        ? __ADDON_DESCRIPTION__
        : "Adds one Saved Filters button on Latest Updates with active preset tracking.",
    capabilities: Array.isArray(__ADDON_CAPABILITIES__) ? __ADDON_CAPABILITIES__ : [],
    requiresCore: Boolean(__ADDON_REQUIRES_CORE__),
  };
}
