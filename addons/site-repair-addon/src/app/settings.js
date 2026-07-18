import {
  DEFAULT_SETTINGS,
  MAX_CONFIGURED_ATTEMPTS,
  MAX_RETRY_DELAY_MS,
  MIN_ATTEMPTS,
  MIN_RETRY_DELAY_MS,
} from "../constants.js";

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function normalizeSiteRepairSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const repairs = source.repairs && typeof source.repairs === "object" ? source.repairs : {};
  const imageAttachments = repairs.imageAttachments && typeof repairs.imageAttachments === "object"
    ? repairs.imageAttachments
    : {};
  return {
    enabled: source.enabled !== false,
    showRepairActivity: source.showRepairActivity !== false,
    repairs: {
      imageAttachments: {
        enabled: imageAttachments.enabled !== false,
        maxAttempts: boundedInteger(
          imageAttachments.maxAttempts,
          DEFAULT_SETTINGS.repairs.imageAttachments.maxAttempts,
          MIN_ATTEMPTS,
          MAX_CONFIGURED_ATTEMPTS,
        ),
        retryDelayMs: boundedInteger(
          imageAttachments.retryDelayMs,
          DEFAULT_SETTINGS.repairs.imageAttachments.retryDelayMs,
          MIN_RETRY_DELAY_MS,
          MAX_RETRY_DELAY_MS,
        ),
      },
      latestAjax: { enabled: repairs.latestAjax?.enabled !== false },
    },
  };
}

export function getDefaultSiteRepairSettings() {
  return normalizeSiteRepairSettings(DEFAULT_SETTINGS);
}
