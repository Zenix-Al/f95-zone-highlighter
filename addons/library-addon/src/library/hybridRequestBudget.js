import { LIBRARY_MIN_UPDATE_SPACING_MS } from "../constants.js";
import { SITE_BLOCK_PAUSE_MS, SITE_BLOCK_REASONS } from "./autoUpdatePolicy.js";
import { createUpdateErrorLog, UPDATE_ERROR_LOG_KEY } from "./updateErrorLog.js";

export const HYBRID_BUDGET_KEY = "hybrid-request-budget-v1";
export const HYBRID_LOCK_NAME = "f95ue:library:hybrid-requests:v1";
const HOUR_MS = 3_600_000;
const API_LIMIT = 80;
const FIELDS = new Set(["key", "version", "hour", "used", "lastClockAt", "nextAttemptAt",
  "apiBlockedUntil", "apiBlockedReason", "siteBlockedUntil", "siteBlockedReason"]);
const integer = (value) => Number.isSafeInteger(value) && value >= 0;

export function createHybridBudgetRepository(api) {
  return {
    read: () => api.getStoreValue("meta", HYBRID_BUDGET_KEY, "key"),
    write: (value) => api.putStoreValue("meta", { ...value, key: HYBRID_BUDGET_KEY }, "key"),
    readErrors: () => api.getStoreValue("meta", UPDATE_ERROR_LOG_KEY, "key"),
    writeErrors: (value) => api.putStoreValue("meta", value, "key"),
  };
}

function restore(value, currentTime) {
  if (value === null) return {
    version: 1, hour: Math.floor(currentTime / HOUR_MS), used: 0,
    lastClockAt: currentTime, nextAttemptAt: 0,
    apiBlockedUntil: 0, apiBlockedReason: "",
    siteBlockedUntil: 0, siteBlockedReason: "",
  };
  if (!value || Object.keys(value).some((key) => !FIELDS.has(key))
    || value.version !== 1 || !integer(value.hour) || !integer(value.used)
    || value.used > API_LIMIT || !integer(value.lastClockAt) || !integer(value.nextAttemptAt)
    || !integer(value.apiBlockedUntil) || !integer(value.siteBlockedUntil)
    || !["", ...SITE_BLOCK_REASONS].includes(value.apiBlockedReason)
    || !["", ...SITE_BLOCK_REASONS].includes(value.siteBlockedReason)
    || value.hour !== Math.floor(value.lastClockAt / HOUR_MS)) {
    throw new Error("invalid_budget");
  }
  if (currentTime < value.lastClockAt) throw new Error("clock_regressed");
  return {
    ...value,
    hour: Math.floor(currentTime / HOUR_MS),
    used: Math.floor(currentTime / HOUR_MS) > value.hour ? 0 : value.used,
    lastClockAt: currentTime,
  };
}

function snapshot(state, currentTime) {
  return {
    hour: state.hour, used: state.used, limit: API_LIMIT,
    remaining: API_LIMIT - state.used,
    nextApiAt: Math.max(currentTime, state.nextAttemptAt, state.apiBlockedUntil,
      state.siteBlockedUntil, state.used >= API_LIMIT ? (state.hour + 1) * HOUR_MS : 0),
    apiBlockedUntil: state.apiBlockedUntil, apiBlockedReason: state.apiBlockedReason,
    siteBlockedUntil: state.siteBlockedUntil, siteBlockedReason: state.siteBlockedReason,
  };
}

function wait(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(); return; }
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

// Request callbacks must classify HTTP/body challenges before returning. This
// gate owns reservations/pacing, not retries, parsing, daily slots or commits.
export function createHybridRequestBudget({
  repository, locks = globalThis.isSecureContext === true ? globalThis.navigator?.locks : undefined,
  now = Date.now, waitFor = wait,
  getSiteBlock = async () => null,
}) {
  async function read() {
    const result = await repository.read();
    if (!result?.ok) throw new Error("budget_read_failed");
    const currentTime = now();
    if (!integer(currentTime)) throw new Error("invalid_clock");
    const state = restore(result.value, currentTime);
    const block = await getSiteBlock();
    if (block && Number(block.blockedUntil) > state.siteBlockedUntil) {
      if (!integer(block.blockedUntil) || !SITE_BLOCK_REASONS.has(block.blockedReason)) {
        throw new Error("invalid_site_block");
      }
      state.siteBlockedUntil = block.blockedUntil;
      state.siteBlockedReason = block.blockedReason;
    }
    return state;
  }

  async function write(state) {
    const result = await repository.write(state);
    if (!result?.ok) throw new Error("budget_write_failed");
  }

  async function locked(signal, callback) {
    if (signal?.aborted) return { ok: false, reason: "cancelled" };
    if (typeof locks?.request !== "function") return { ok: false, reason: "locking_unavailable" };
    try {
      return await locks.request(HYBRID_LOCK_NAME, { mode: "exclusive", ...(signal ? { signal } : {}) }, callback);
    } catch (error) {
      return { ok: false, reason: signal?.aborted ? "cancelled" : String(error?.message || "budget_failed") };
    }
  }

  function getStatus({ signal } = {}) {
    return locked(signal, async () => ({ ok: true, value: snapshot(await read(), now()) }));
  }

  function attempt(source, request, {
    signal, stillOwn = async () => true, spacingMs = LIBRARY_MIN_UPDATE_SPACING_MS,
  } = {}) {
    return locked(signal, async () => {
      if (!["api", "html"].includes(source)) return { ok: false, reason: "invalid_source" };
      if (typeof request !== "function") return { ok: false, reason: "invalid_request" };
      let state = await read();
      async function guard(checkAllowance = true) {
        if (signal?.aborted) return "cancelled";
        if (!(await stillOwn())) return "lease_lost";
        if (state.siteBlockedUntil > now()) return "site_blocked";
        if (source === "api" && state.apiBlockedUntil > now()) return "api_suppressed";
        if (checkAllowance && source === "api" && state.used >= API_LIMIT) return "api_exhausted";
        return "";
      }
      for (;;) {
        const reason = await guard();
        if (reason) {
          // Preserve a global block observed from the existing queue across restart.
          if (reason === "site_blocked") await write(state);
          return { ok: false, reason, value: snapshot(state, now()) };
        }
        if (state.nextAttemptAt <= now()) break;
        await waitFor(Math.min(30_000, state.nextAttemptAt - now()), signal);
        if (signal?.aborted) return { ok: false, reason: "cancelled" };
        state = await read();
      }
      const spacing = Math.max(LIBRARY_MIN_UPDATE_SPACING_MS,
        Number.isFinite(Number(spacingMs)) ? Number(spacingMs) : LIBRARY_MIN_UPDATE_SPACING_MS);
      const startedAt = now();
      state = restore(state, startedAt);
      state.nextAttemptAt = startedAt + Math.ceil(spacing);
      if (source === "api") state.used += 1;
      await write(state); // Durable, non-refundable reservation BEFORE the callback.
      const stopped = await guard(false);
      if (stopped) return { ok: false, reason: stopped };
      let result;
      try { result = await request({ signal }); }
      catch { result = { ok: false, reason: signal?.aborted ? "cancelled" : "network_error" }; }
      state = restore(state, now());
      state.nextAttemptAt = Math.max(state.nextAttemptAt, now() + Math.ceil(spacing));
      if (SITE_BLOCK_REASONS.has(result?.reason)) {
        const prefix = source === "api" ? "api" : "site";
        const retryAfter = String(result.retryAfter ?? "").trim();
        let retryAt = /^\d+$/.test(retryAfter)
          ? Math.min(Number.MAX_SAFE_INTEGER, now() + Number(retryAfter) * 1000)
          : Date.parse(retryAfter);
        if (!Number.isSafeInteger(retryAt) || retryAt < now()) retryAt = 0;
        state[`${prefix}BlockedUntil`] = Math.max(state[`${prefix}BlockedUntil`], now() + SITE_BLOCK_PAUSE_MS,
          source === "api" ? retryAt : 0);
        state[`${prefix}BlockedReason`] = result.reason;
      }
      await write(state);
      if (signal?.aborted) return { ok: false, reason: "cancelled" };
      if (!(await stillOwn())) return { ok: false, reason: "lease_lost" };
      return { ok: true, result, value: snapshot(state, now()) };
    });
  }

  function clearSiteBlock({ signal } = {}) {
    return locked(signal, async () => {
      const state = await read();
      state.siteBlockedUntil = 0;
      state.siteBlockedReason = "";
      await write(state);
      return { ok: true, value: snapshot(state, now()) };
    });
  }
  const errors = createUpdateErrorLog({ repository, locked, now });
  return { getStatus, attempt, clearSiteBlock,
    recordError: errors.record, getRecentErrors: errors.list,
    isAvailable: () => typeof locks?.request === "function" };
}
