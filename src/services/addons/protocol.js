export const ADDON_PROTOCOL_VERSION = 1;
export const ADDON_REQUEST_TIMEOUT_MS = 5_000;
export const ADDON_REQUEST_CACHE_TTL_MS = 30_000;
export const ADDON_REQUEST_CACHE_LIMIT = 128;

export function validateAddonRequestEnvelope(detail, { apiVersion, marker } = {}) {
  const request = detail && typeof detail === "object" ? detail : null;
  if (!request) return { ok: false, reason: "invalid_envelope" };
  if (String(request.marker || "") !== String(marker || "")) return { ok: false, reason: "invalid_marker" };
  if (String(request.protocolVersion || "") !== String(apiVersion || "")) return { ok: false, reason: "unsupported_protocol" };
  if (!/^[a-z0-9_-]{8,128}$/i.test(String(request.requestId || ""))) return { ok: false, reason: "invalid_request_id" };
  if (!String(request.addonId || "").trim() || !String(request.action || "").trim()) return { ok: false, reason: "invalid_envelope" };
  if (!request.payload || typeof request.payload !== "object" || Array.isArray(request.payload)) return { ok: false, reason: "invalid_payload" };
  return { ok: true };
}

export function createReplayCache({ ttlMs = ADDON_REQUEST_CACHE_TTL_MS, limit = ADDON_REQUEST_CACHE_LIMIT } = {}) {
  const entries = new Map();
  const prune = () => { const now = Date.now(); for (const [key, expiresAt] of entries) if (expiresAt <= now) entries.delete(key); };
  return {
    seen(addonId, requestId) { prune(); const key = `${addonId}:${requestId}`; if (entries.has(key)) return true; entries.set(key, Date.now() + ttlMs); while (entries.size > limit) entries.delete(entries.keys().next().value); return false; },
    clear() { entries.clear(); },
  };
}

export function createSafeAddonResponse({ apiVersion, addonId, requestId, result }) {
  const source = result && typeof result === "object" ? result : { ok: false, reason: "internal_error" };
  return { ok: source.ok === true, reason: source.ok === true ? undefined : String(source.reason || "internal_error"), value: source.ok === true ? source.value : undefined, protocolVersion: apiVersion, addonId: String(addonId || ""), requestId: String(requestId || "") };
}
