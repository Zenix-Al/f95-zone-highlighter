import { getSafeTrimmedString } from "./typeHelpers.js";

export function toNonNegativeInteger(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

export function normalizeDirectDownloadHealthEntry(value, fallback = {}) {
  const source = value && typeof value === "object" ? value : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  return {
    failCount: toNonNegativeInteger(source.failCount, toNonNegativeInteger(base.failCount, 0)),
    autoDisabled: Boolean(source.autoDisabled),
    noticeDismissed: Boolean(source.noticeDismissed),
    lastError: getSafeTrimmedString(source.lastError, "").slice(0, 240),
    updatedAt: toNonNegativeInteger(source.updatedAt, toNonNegativeInteger(base.updatedAt, 0)),
  };
}
