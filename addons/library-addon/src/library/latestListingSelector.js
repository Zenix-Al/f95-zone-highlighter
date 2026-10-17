import { normalizeF95ThreadId } from "./threadIdentity.js";

export const LATEST_SEARCH_ROWS = 15;

function threadId(value) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) return "";
  if (typeof value !== "number" && typeof value !== "string") return "";
  return normalizeF95ThreadId(value);
}

// Compare JSON facts independently of object property order, with bounded work.
function fingerprint(value, depth = 0, budget = { remaining: 4096 }) {
  if (--budget.remaining < 0 || depth > 5) throw new Error("listing_too_complex");
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value === "string" && value.length <= 8192) return JSON.stringify(value);
  if (Array.isArray(value) && value.length <= 256) {
    return `[${value.map((item) => fingerprint(item, depth + 1, budget)).join(",")}]`;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value).sort();
    if (keys.length <= 64) {
      return `{${keys.map((key) => {
        if (key.length > 128) throw new Error("listing_key_too_long");
        return `${JSON.stringify(key)}:${fingerprint(value[key], depth + 1, budget)}`;
      }).join(",")}}`;
    }
  }
  throw new Error("invalid_listing_value");
}

export function selectLatestListing(payload, savedThreadId) {
  const fallback = (reason) => ({ ok: false, reason });
  const expectedId = threadId(savedThreadId);
  if (!expectedId) return fallback("invalid_thread_id");
  const rows = payload?.msg?.data;
  if (payload?.status !== "ok" || !Array.isArray(rows) || rows.length > LATEST_SEARCH_ROWS) {
    return fallback("invalid_response");
  }
  const pagination = payload.msg.pagination;
  if (pagination && pagination.page !== 1) return fallback("invalid_response");
  let match = null;
  let signature = "";
  try {
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) return fallback("invalid_response");
      const id = threadId(row.thread_id);
      if (!id) return fallback("invalid_response");
      if (id !== expectedId) continue;
      const nextSignature = fingerprint({ ...row, thread_id: id });
      if (match && nextSignature !== signature) return fallback("conflicting_matches");
      if (!match) match = row;
      signature = nextSignature;
    }
  } catch {
    return fallback("invalid_response");
  }
  if (!match) return fallback("id_not_found");
  const validVersion = (typeof match.version === "number" && Number.isFinite(match.version))
    || (typeof match.version === "string" && Boolean(match.version.trim()) && match.version.length <= 160);
  if (typeof match.title !== "string" || !match.title.trim() || match.title.length > 1000
    || !validVersion) {
    return fallback("missing_facts");
  }
  return { ok: true, reason: "api_id_match", value: typeof match.version === "number"
    ? { ...match, version: String(match.version) } : match };
}
