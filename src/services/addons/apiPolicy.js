import { config, defaultAddonsApiThrottleSettings } from "../../config.js";

export const MAX_ADDON_IDB_PAYLOAD_BYTES = 512 * 1024;
export const MAX_ADDON_IDB_BULK_ITEMS = 500;
export const MAX_ADDON_STYLE_TEXT_BYTES = 64 * 1024;
export const MAX_ADDON_UI_HTML_BYTES = 128 * 1024;
export const MAX_ADDON_STORAGE_VALUE_BYTES = 16 * 1024;
export const MAX_ADDON_STORAGE_TOTAL_BYTES = 64 * 1024;

export const ADDON_CORE_ACTION_LIMITS = Object.freeze({
  maxAddonStorageValueBytes: MAX_ADDON_STORAGE_VALUE_BYTES,
  maxAddonStorageTotalBytes: MAX_ADDON_STORAGE_TOTAL_BYTES,
  maxAddonIdbPayloadBytes: MAX_ADDON_IDB_PAYLOAD_BYTES,
  maxAddonIdbBulkItems: MAX_ADDON_IDB_BULK_ITEMS,
  maxAddonUiHtmlBytes: MAX_ADDON_UI_HTML_BYTES,
  maxAddonStyleTextBytes: MAX_ADDON_STYLE_TEXT_BYTES,
});

export function isAddonsServiceDisabled() {
  return Boolean(config.globalSettings?.disableAddonsService);
}

export function clampAddonsServiceNumber(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

export function getAddonsCoreActionThrottleConfig() {
  const throttle = config.addons?.service?.apiThrottle || {};

  return {
    windowMs: clampAddonsServiceNumber(
      throttle.coreActionWindowMs,
      defaultAddonsApiThrottleSettings.coreActionWindowMs,
      { min: 250, max: 60000 },
    ),
    maxCount: clampAddonsServiceNumber(
      throttle.coreActionRateMax,
      defaultAddonsApiThrottleSettings.coreActionRateMax,
      { min: 1, max: 1000 },
    ),
    maxConcurrent: clampAddonsServiceNumber(
      throttle.coreActionMaxConcurrent,
      defaultAddonsApiThrottleSettings.coreActionMaxConcurrent,
      { min: 1, max: 100 },
    ),
  };
}

const PAYLOAD_SIZE_ENCODER = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

export function measurePayloadBytes(payload) {
  try {
    const json = JSON.stringify(payload ?? null);
    if (PAYLOAD_SIZE_ENCODER) return PAYLOAD_SIZE_ENCODER.encode(json).length;
    // Best-effort fallback (UTF-16 code units, not bytes).
    return json.length;
  } catch {
    return MAX_ADDON_IDB_PAYLOAD_BYTES + 1;
  }
}
