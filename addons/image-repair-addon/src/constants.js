/* global __ADDON_ID__, __ADDON_CAPABILITIES__, __ADDON_REQUIRES_CORE__ */

export const CORE_EVENT = "f95ue:addons-dev-command";
export const ADDON_COMMAND_EVENT = "f95ue:addon-command";

export const PING_TIMEOUT_MS = 1500;
export const CORE_ACTION_TIMEOUT_MS = 2000;

export const IMAGE_HOST = "https://attachments.f95zone.to/";
export const MAX_ATTEMPTS = 10;
export const RETRY_DELAY = 4000;
export const QUEUE_DELAY = 200;
export const TOAST_UPDATE_INTERVAL = 500;

export function getRuntimeConfig() {
  return {
    addonId: typeof __ADDON_ID__ === "string" ? __ADDON_ID__ : "image-repair-addon",
    capabilities: Array.isArray(__ADDON_CAPABILITIES__) ? __ADDON_CAPABILITIES__ : [],
    requiresCore: Boolean(__ADDON_REQUIRES_CORE__),
  };
}
