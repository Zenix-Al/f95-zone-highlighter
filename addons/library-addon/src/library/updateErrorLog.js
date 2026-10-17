import { normalizeF95ThreadId } from "./threadIdentity.js";

export const UPDATE_ERROR_LOG_KEY = "update-errors-v1";
const LIMIT = 20;
const CODES = new Set(["timeout", "network_error", "challenge_page", "authentication_required",
  "rate_limited", "invalid_response", "malformed_html", "version_missing", "response_too_large",
  "id_not_found", "conflicting_matches", "missing_facts", "mapping_incomplete", "invalid_facts",
  "invalid_thread_id", "invalid_url", "catalog_unavailable", "unknown_error"]);
const OUTCOMES = new Set(["fallback_pending", "recovered", "failed", "deferred", "cancelled"]);
const ACTIONS = new Set(["fallback", "site_pause", "retry_eligible", "none", "deferred", "cancelled"]);
const code = (value) => CODES.has(value) || /^http_\d{3}$/.test(value) ? value : "unknown_error";
const boundedText = (value, limit) => typeof value === "string"
  ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit) : "";

function clean(entry) {
  return {
    id: /^[a-zA-Z0-9:.-]{1,100}$/.test(entry?.id) ? entry.id : "invalid",
    timestamp: Number.isSafeInteger(entry?.timestamp) && entry.timestamp >= 0 ? entry.timestamp : 0,
    threadId: normalizeF95ThreadId(entry?.threadId),
    source: entry?.source === "latest-api" ? "latest-api" : "thread-html",
    code: code(entry?.code),
    outcome: OUTCOMES.has(entry?.outcome) ? entry.outcome : "failed",
    action: ACTIONS.has(entry?.action) ? entry.action : "none",
    ...(entry?.source === "latest-api" ? {
      title: boundedText(entry.title, 200), developer: boundedText(entry.developer, 120),
      query: boundedText(entry.query, 30), creatorQuery: boundedText(entry.creatorQuery, 30),
    } : {}),
  };
}

export function formatRecentUpdateErrors(result) {
  if (!result?.ok) return ["Recent update errors: unavailable"];
  const entries = Array.isArray(result.value) ? result.value.slice(0, LIMIT).map(clean) : [];
  return [`Recent update errors (${entries.length}/${LIMIT}, newest first):`,
    ...entries.map((entry) => `${entry.timestamp} | thread ${entry.threadId || "-"} | ${entry.source} | ${entry.code} | ${entry.outcome} | ${entry.action}`
      + (entry.source === "latest-api" ? ` | title=${JSON.stringify(entry.title)} | developer=${JSON.stringify(entry.developer)} | search=${JSON.stringify(entry.query)} | creator=${JSON.stringify(entry.creatorQuery)}` : ""))];
}

// The injected lock is the existing request lock. Never call from inside an
// attempt callback: logging runs after that lock is released, without nesting.
export function createUpdateErrorLog({ repository, locked, now = Date.now }) {
  async function read() {
    const result = await repository.readErrors();
    if (!result?.ok) throw new Error("error_log_read_failed");
    if (result.value === null) return [];
    if (result.value?.version !== 1 || !Array.isArray(result.value.entries)) throw new Error("invalid_error_log");
    return result.value.entries.slice(0, LIMIT).map(clean);
  }
  return {
    list: () => locked(undefined, async () => ({ ok: true, value: await read() })),
    record: (entry, id) => locked(undefined, async () => {
      const entries = await read();
      const existing = id ? entries.find((item) => item.id === id) : null;
      // A slow fallback may finish after its error has aged out of the ring.
      if (id && !existing) return { ok: true, id };
      const value = clean(existing ? { ...existing, ...entry, id, timestamp: existing.timestamp }
        : { ...entry, id: `${now()}:${Math.random().toString(36).slice(2)}`, timestamp: now() });
      const next = existing ? entries.map((item) => item.id === id ? value : item) : [value, ...entries].slice(0, LIMIT);
      const result = await repository.writeErrors({ key: UPDATE_ERROR_LOG_KEY, version: 1, entries: next });
      if (!result?.ok) throw new Error("error_log_write_failed");
      return { ok: true, id: value.id };
    }),
  };
}
