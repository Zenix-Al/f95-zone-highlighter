import { LIBRARY_AUTO_UPDATE_DEFAULTS } from "../constants.js";

const CONFIG_KEY = "auto-update:config";
const SUMMARY_KEY = "auto-update:last-run";
const LEASE_KEY = "auto-update:lease";
const QUEUE_COMPAT_KEY = "auto-update:queue-compat-v1";

function dayKeys(timestamp) {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return [];
  const local = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return [...new Set([local, date.toISOString().slice(0, 10)])];
}

function bounded(value, fallback, min, max) {
  return Math.min(max, Math.max(min, Number(value ?? fallback)));
}

export function normalizeAutoUpdateConfig(value = {}) {
  value = value || {};
  const defaults = LIBRARY_AUTO_UPDATE_DEFAULTS;
  return {
    enabled: value.enabled !== false,
    intervalMs: bounded(value.intervalMs, defaults.intervalMs, 6 * 3600000, 30 * 86400000),
    runHour: bounded(value.runHour, defaults.runHour, 0, 23),
    spacingMs: bounded(value.spacingMs, defaults.spacingMs, 5000, 30_000),
    jitterMs: bounded(value.jitterMs, defaults.jitterMs, 0, 10_000),
    timeoutMs: bounded(value.timeoutMs, defaults.timeoutMs, 1000, 30_000),
    retryLimit: bounded(value.retryLimit, defaults.retryLimit, 0, 5),
    checksPerDay: bounded(
      value.checksPerDay ?? value.dailyCap,
      defaults.checksPerDay,
      1,
      500,
    ),
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
    async getLegacyQueueMetadata(timestamp = Date.now()) {
      const marker = await api.getMeta(QUEUE_COMPAT_KEY);
      if (marker?.complete === true) return { complete: true, days: [] };
      const days = dayKeys(timestamp);
      const [summary, ...daily] = await Promise.all([
        api.getMeta(SUMMARY_KEY),
        ...days.map((day) => api.getMeta(`auto-update:daily:${day}`)),
      ]);
      return {
        summary,
        days,
        dailyAttempted: daily.reduce(
          (highest, value) => Math.max(highest, Number(value?.count || 0)),
          0,
        ),
      };
    },
    async clearLegacyQueueMetadata(days = []) {
      const keys = [SUMMARY_KEY, ...days.map((day) => `auto-update:daily:${day}`)];
      const results = await Promise.all(keys.map((key) => api.deleteMeta(key)));
      const failure = results.find((result) => !result?.ok);
      if (failure) return failure;
      return api.putMeta({ key: QUEUE_COMPAT_KEY, complete: true });
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
  };
}
