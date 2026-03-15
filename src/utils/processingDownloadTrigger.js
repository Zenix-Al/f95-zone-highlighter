import { getSafeTrimmedString } from "./typeHelpers.js";

export const PROCESSING_TRIGGER_MIN_TTL_MS = 60 * 1000;
export const PROCESSING_TRIGGER_MAX_TTL_MS = 90 * 1000;
export const PROCESSING_TRIGGER_BUFFER_MS = 10 * 1000;

function toFinitePositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function createInactiveProcessingDownloadTrigger() {
  return {
    active: false,
    startedAt: 0,
    expiresAt: 0,
    requestId: null,
    ownerTabId: null,
    sourceHref: "",
  };
}

export function clampProcessingTriggerWindowMs(windowMs) {
  const requested = toFinitePositiveNumber(windowMs, PROCESSING_TRIGGER_MIN_TTL_MS);
  const withBuffer = requested + PROCESSING_TRIGGER_BUFFER_MS;
  return Math.min(
    PROCESSING_TRIGGER_MAX_TTL_MS,
    Math.max(PROCESSING_TRIGGER_MIN_TTL_MS, withBuffer),
  );
}

export function createProcessingDownloadTrigger(windowMs, now = Date.now()) {
  const ttl = clampProcessingTriggerWindowMs(windowMs);
  const startedAt = toFinitePositiveNumber(now, Date.now());
  return {
    active: true,
    startedAt,
    expiresAt: startedAt + ttl,
    requestId: `${startedAt}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

export function normalizeProcessingDownloadTrigger(value, now = Date.now()) {
  if (value === true) {
    // Legacy migration path: old boolean true becomes a short-lived active trigger.
    return createProcessingDownloadTrigger(PROCESSING_TRIGGER_MIN_TTL_MS, now);
  }
  if (!value || value === false || typeof value !== "object") {
    return createInactiveProcessingDownloadTrigger();
  }

  const active = Boolean(value.active);
  const startedAt = toFinitePositiveNumber(value.startedAt, now);
  const expiresAtInput = toFinitePositiveNumber(
    value.expiresAt,
    startedAt + PROCESSING_TRIGGER_MIN_TTL_MS,
  );
  const rawWindow = Math.max(1, expiresAtInput - startedAt);
  const clampedWindow = Math.min(
    PROCESSING_TRIGGER_MAX_TTL_MS,
    Math.max(PROCESSING_TRIGGER_MIN_TTL_MS, rawWindow),
  );
  const expiresAt = startedAt + clampedWindow;
  const requestId = getSafeTrimmedString(value.requestId, `${startedAt}-legacy`);
  const ownerTabId = getSafeTrimmedString(value.ownerTabId, "") || null;
  const sourceHref = getSafeTrimmedString(value.sourceHref, "");

  if (!active) {
    return createInactiveProcessingDownloadTrigger();
  }

  return {
    active: true,
    startedAt,
    expiresAt,
    requestId,
    ownerTabId,
    sourceHref,
  };
}

export function isProcessingDownloadTriggerActive(value, now = Date.now()) {
  const trigger = normalizeProcessingDownloadTrigger(value, now);
  return trigger.active && now <= trigger.expiresAt;
}
