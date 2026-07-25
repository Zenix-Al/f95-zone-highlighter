import { LIBRARY_AUTO_UPDATE_DEFAULTS } from "../constants.js";

const CONFIG_KEY = "auto-update:config";
const SUMMARY_KEY = "auto-update:last-run";
const LEASE_KEY = "auto-update:lease";

function bounded(value, fallback, min, max) {
  return Math.min(max, Math.max(min, Number(value ?? fallback)));
}

export function normalizeAutoUpdateConfig(value = {}) {
  value = value || {};
  const defaults = LIBRARY_AUTO_UPDATE_DEFAULTS;
  return {
    enabled: value.enabled !== false,
    intervalMs: bounded(value.intervalMs, defaults.intervalMs, 6 * 3600000, 30 * 86400000),
    spacingMs: bounded(value.spacingMs, defaults.spacingMs, 5000, 30_000),
    jitterMs: bounded(value.jitterMs, defaults.jitterMs, 0, 10_000),
    timeoutMs: bounded(value.timeoutMs, defaults.timeoutMs, 1000, 30_000),
    retryLimit: bounded(value.retryLimit, defaults.retryLimit, 0, 5),
    sessionCap: bounded(value.sessionCap, defaults.sessionCap, 1, 100),
    dailyCap: bounded(value.dailyCap, defaults.dailyCap, 1, 500),
    leaseTtlMs: bounded(value.leaseTtlMs, defaults.leaseTtlMs, 30_000, 300_000),
  };
}

export function createAutoUpdateRepository(api) {
  return {
    async getConfig() {
      return normalizeAutoUpdateConfig(await api.getMeta(CONFIG_KEY));
    },
    putConfig(config) {
      return api.putMeta({ key: CONFIG_KEY, ...normalizeAutoUpdateConfig(config) });
    },
    getSummary() {
      return api.getMeta(SUMMARY_KEY);
    },
    putSummary(summary) {
      return api.putMeta({ key: SUMMARY_KEY, ...summary });
    },
    getDailyUsage(day) {
      return api.getMeta(`auto-update:daily:${day}`);
    },
    putDailyUsage(day, count) {
      return api.putMeta({ key: `auto-update:daily:${day}`, day, count });
    },
    getLease() {
      return api.getMeta(LEASE_KEY);
    },
    putLease(lease) {
      return api.putMeta({ key: LEASE_KEY, ...lease });
    },
    deleteLease() {
      return api.deleteMeta(LEASE_KEY);
    },
    getClaim(threadId) {
      return api.getMeta(`auto-update:claim:${threadId}`);
    },
    putClaim(threadId, claim) {
      return api.putMeta({ key: `auto-update:claim:${threadId}`, ...claim });
    },
    deleteClaim(threadId) {
      return api.deleteMeta(`auto-update:claim:${threadId}`);
    },
  };
}
