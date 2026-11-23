import { LIBRARY_AUTO_UPDATE_DEFAULTS, LIBRARY_MIN_UPDATE_SPACING_MS } from "../constants.js";
import { getDailyCheckLimit } from "./dailyCheckLimit.js";

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

export function normalizeAutoUpdateConfig(value = {}, entryCount = null) {
  value = value || {};
  const defaults = LIBRARY_AUTO_UPDATE_DEFAULTS;
  const maxChecksPerDay = getDailyCheckLimit(entryCount);
  return {
    entryCount,
    maxChecksPerDay,
    enabled: value.enabled !== false,
    preferLatestApi: value.preferLatestApi === true,
    intervalMs: bounded(value.intervalMs, defaults.intervalMs, 6 * 3600000, 30 * 86400000),
    runHour: bounded(value.runHour, defaults.runHour, 0, 23),
    spacingMs: bounded(
      Number.isFinite(Number(value.spacingMs)) ? value.spacingMs : defaults.spacingMs,
      defaults.spacingMs, LIBRARY_MIN_UPDATE_SPACING_MS, 30_000,
    ),
    jitterMs: bounded(value.jitterMs, defaults.jitterMs, 0, 10_000),
    timeoutMs: bounded(value.timeoutMs, defaults.timeoutMs, 1000, 30_000),
    retryLimit: bounded(value.retryLimit, defaults.retryLimit, 0, 5),
    checksPerDay: bounded(
      Number.isFinite(Number(value.checksPerDay ?? value.dailyCap))
        ? Math.trunc(Number(value.checksPerDay ?? value.dailyCap)) : defaults.checksPerDay,
      defaults.checksPerDay,
      1,
      maxChecksPerDay,
    ),
    leaseTtlMs: bounded(value.leaseTtlMs, defaults.leaseTtlMs, 30_000, 300_000),
  };
}

export function createAutoUpdateRepository(api) {
  async function getEntryCount() {
    if (typeof api.countEntries !== "function") return null;
    try {
      const result = await api.countEntries();
      return result?.ok && Number.isSafeInteger(result.value) && result.value >= 0 ? result.value : null;
    } catch { return null; }
  }
  return {
    async getConfig() {
      const [value, entryCount] = await Promise.all([api.getMeta(CONFIG_KEY), getEntryCount()]);
      return normalizeAutoUpdateConfig(value, entryCount);
    },
    async putConfig(config) {
      const entryCount = await getEntryCount();
      if (entryCount === null && typeof api.countEntries === "function") return { ok: false, reason: "entry_count_unavailable" };
      const stored = normalizeAutoUpdateConfig(config, entryCount);
      delete stored.entryCount;
      delete stored.maxChecksPerDay;
      return api.putMeta({ key: CONFIG_KEY, ...stored });
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
