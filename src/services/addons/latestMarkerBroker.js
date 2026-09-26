// DOM-free boundary between Latest Overlay and data-only add-on providers.
export const MARKER_LIMITS = Object.freeze({ providers: 16, ids: 100, bytes: 32768, label: 40, description: 160, timeoutMs: 1500 });
const ID = /^(?!__proto__$|constructor$|prototype$)[a-z0-9][a-z0-9_-]{0,63}$/;
const THREAD_ID = /^[1-9]\d{0,19}$/;
const TONES = new Set(["muted", "info", "success", "warning", "danger"]);

export function createLatestMarkerBroker({ authorize, enabled = () => true, dispatch, now = Date.now, onChange = () => {}, timeoutMs = MARKER_LIMITS.timeoutMs }) {
  const providers = new Map();
  const pending = new Map();
  let sequence = 0;

  function validId(value) { return typeof value === "string" && ID.test(value); }
  function isAllowed(owner) { return authorize(owner) === true; }
  function clearPending(predicate) {
    for (const [requestId, request] of pending) {
      if (!predicate(request)) continue;
      pending.delete(requestId);
      clearTimeout(request.timer);
      request.signal?.removeEventListener("abort", request.abort);
      request.finish({});
    }
  }
  function register(owner, payload = {}) {
    const id = payload.id;
    if (!isAllowed(owner)) return { ok: false, reason: "provider_owner_not_allowed" };
    if (!validId(id)) return { ok: false, reason: "invalid_provider_id" };
    if (providers.has(id)) return { ok: false, reason: "provider_id_taken" };
    if (providers.size >= MARKER_LIMITS.providers) return { ok: false, reason: "provider_limit" };
    const name = String(payload.name || "").trim();
    const description = String(payload.description || "").trim();
    if (!name || name.length > 80 || description.length > 240) return { ok: false, reason: "invalid_provider_metadata" };
    const provider = { id, owner, name, description, priority: Math.max(0, Math.min(100, Math.trunc(Number(payload.priority) || 50))), generation: ++sequence };
    providers.set(id, provider);
    onChange(id);
    return { ok: true, value: { ...provider } };
  }
  function unregister(owner, id) {
    const provider = providers.get(id);
    if (!provider || provider.owner !== owner) return { ok: false, reason: "provider_not_owned" };
    providers.delete(id);
    clearPending((request) => request.provider === provider);
    onChange(id);
    return { ok: true };
  }
  function removeOwner(owner) {
    for (const provider of [...providers.values()]) if (provider.owner === owner) unregister(owner, provider.id);
  }
  function reset() {
    for (const provider of [...providers.values()]) unregister(provider.owner, provider.id);
  }
  function cancelPending() { clearPending(() => true); }
  function prune() {
    for (const provider of [...providers.values()]) if (!isAllowed(provider.owner)) unregister(provider.owner, provider.id);
  }
  function list() { return [...providers.values()].filter((provider) => isAllowed(provider.owner)).map(({ id, name, description, priority }) => ({ id, name, description, priority })); }
  function invalidate(owner, id) {
    if (providers.get(id)?.owner !== owner || !isAllowed(owner)) return { ok: false, reason: "provider_not_owned" };
    onChange(id);
    return { ok: true };
  }
  function normalizeMarkers(markers, ids) {
    if (!markers || typeof markers !== "object" || Array.isArray(markers)) return {};
    let bytes;
    try { bytes = JSON.stringify(markers).length; } catch { return {}; }
    if (bytes > MARKER_LIMITS.bytes) return {};
    const allowed = new Set(ids);
    const result = {};
    for (const [id, marker] of Object.entries(markers)) {
      if (!allowed.has(id) || !marker || typeof marker !== "object" || Array.isArray(marker)) continue;
      if (typeof marker.label !== "string" || typeof marker.description !== "string") continue;
      const label = marker.label.trim().slice(0, MARKER_LIMITS.label);
      const description = marker.description.trim().slice(0, MARKER_LIMITS.description);
      if (!label) continue;
      result[id] = { label, description, tone: TONES.has(marker.tone) ? marker.tone : "muted" };
    }
    return result;
  }
  function respond(owner, payload = {}) {
    const request = pending.get(payload.requestId);
    if (!request || request.provider.id !== payload.providerId || request.provider.owner !== owner || providers.get(payload.providerId) !== request.provider || !isAllowed(owner) || !enabled(payload.providerId)) {
      return { ok: false, reason: "stale_or_unowned_request" };
    }
    pending.delete(payload.requestId);
    clearTimeout(request.timer);
    request.signal?.removeEventListener("abort", request.abort);
    request.finish(normalizeMarkers(payload.markers, request.ids));
    return { ok: true };
  }
  async function query(id, threadIds, { signal } = {}) {
    const provider = providers.get(id);
    if (!provider || !isAllowed(provider.owner) || !enabled(id) || signal?.aborted) return {};
    const ids = [...new Set((Array.isArray(threadIds) ? threadIds : []).filter((value) => typeof value === "string" && THREAD_ID.test(value)))].slice(0, MARKER_LIMITS.ids);
    if (!ids.length) return {};
    if (!signal) {
      const duplicate = [...pending.values()].find((request) => request.provider === provider && !request.signal && request.ids.join(",") === ids.join(","));
      if (duplicate) return duplicate.promise;
    }
    let request;
    const promise = new Promise((finish) => {
      const requestId = `marker-${now()}-${++sequence}`;
      const abort = () => {
        const current = pending.get(requestId);
        if (current) clearPending((candidate) => candidate === current);
      };
      const timer = setTimeout(abort, Math.max(1, Math.min(MARKER_LIMITS.timeoutMs, timeoutMs)));
      request = { provider, ids, finish, timer, signal, abort, promise: null };
      pending.set(requestId, request);
      signal?.addEventListener("abort", abort, { once: true });
      try { dispatch(provider.owner, { command: "latest-markers.query", providerId: id, requestId, threadIds: ids }); }
      catch { abort(); }
    });
    request.promise = promise;
    return promise;
  }
  return { register, unregister, removeOwner, reset, cancelPending, prune, list, invalidate, respond, query, pendingCount: () => pending.size };
}
