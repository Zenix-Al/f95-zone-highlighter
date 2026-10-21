import { normalizeDirectDownloadHost } from "../../hosts/metadata.js";

// One bounded mailbox, no request identity, history, acknowledgements or replay.
export const HOST_FEEDBACK_KEY = "f95ue.addon.maskedDirect.hostFeedback.v1";
const TTL_MS = 15000;
const SEEN_LIMIT = 64;
const MESSAGES = Object.freeze({
  initiated: ["Download initiated", "success"],
  failure: ["Download automation failed; continue in the host tab", "error"],
  challenge: ["Browser verification needs attention in the host tab", "warning"],
});

export function createHostFeedback({
  GMApi,
  addValueChangeListener,
  removeValueChangeListener,
  showToast,
  isEnabled = () => true,
  documentLike = document,
  windowLike = window,
  locationLike = location,
  now = Date.now,
  createId = () =>
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
}) {
  let listenerId = null;
  let generation = 0;
  let burstAt = 0;
  let burstCount = 0;
  const seen = new Set();

  function eligible() {
    return (
      ["f95zone.to", "www.f95zone.to"].includes(locationLike.hostname) &&
      isEnabled() &&
      documentLike.visibilityState === "visible" &&
      documentLike.hasFocus()
    );
  }

  async function publish({ host, outcome } = {}) {
    if (typeof host !== "string" || typeof outcome !== "string") return false;
    const canonical = normalizeDirectDownloadHost(host);
    if (!canonical || !Object.hasOwn(MESSAGES, outcome) || typeof GMApi?.setValue !== "function")
      return false;
    try {
      const id = createId();
      if (typeof id !== "string" || !/^[a-z0-9_-]{1,96}$/i.test(id)) return false;
      await GMApi.setValue(HOST_FEEDBACK_KEY, {
        version: 1,
        id,
        at: now(),
        host: canonical,
        outcome,
      });
      return true;
    } catch {
      return false;
    }
  }

  function receive(payload, remote, token) {
    if (
      token !== generation ||
      listenerId === null ||
      remote !== true ||
      !payload ||
      payload.version !== 1 ||
      typeof payload.id !== "string" ||
      !/^[a-z0-9_-]{1,96}$/i.test(payload.id) ||
      typeof payload.host !== "string" ||
      payload.host.length > 253 ||
      typeof payload.outcome !== "string" ||
      !Object.hasOwn(MESSAGES, payload.outcome) ||
      !Number.isFinite(payload.at) ||
      payload.at > now() ||
      now() - payload.at > TTL_MS
    )
      return;
    const host = normalizeDirectDownloadHost(payload.host);
    if (!host || host !== payload.host || seen.has(payload.id)) return;
    seen.add(payload.id);
    if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value);
    // Consume hidden/unfocused events too: focusing later never replays them.
    if (!eligible()) return;
    if (now() - burstAt >= 2000) {
      burstAt = now();
      burstCount = 0;
    }
    if (burstCount >= 3) return;
    burstCount += 1;
    const [message, type] = MESSAGES[payload.outcome];
    try {
      // No asynchronous work before the focus check and core invocation.
      void Promise.resolve(showToast?.(`${host}: ${message}.`, type)).catch(() => {});
    } catch {
      /* Feedback must not change host processing or add-on health. */
    }
  }

  function suspend() {
    generation += 1;
    if (listenerId !== null) {
      try {
        removeValueChangeListener?.(listenerId);
      } catch {
        /* Best effort. */
      }
    }
    listenerId = null;
  }

  function stop() {
    suspend();
    windowLike.removeEventListener("pagehide", suspend);
    windowLike.removeEventListener("pageshow", start);
  }

  function start() {
    if (listenerId !== null) return true;
    if (
      !["f95zone.to", "www.f95zone.to"].includes(locationLike.hostname) ||
      !isEnabled() ||
      typeof addValueChangeListener !== "function" ||
      typeof removeValueChangeListener !== "function"
    )
      return false;
    const token = ++generation;
    try {
      listenerId = addValueChangeListener(HOST_FEEDBACK_KEY, (_key, _old, value, remote) => {
        try {
          receive(value, remote, token);
        } catch {
          /* Invalid event/platform state is ignored. */
        }
      });
      if (listenerId === undefined || listenerId === null) {
        listenerId = null;
        return false;
      }
      windowLike.addEventListener("pagehide", suspend);
      windowLike.addEventListener("pageshow", start);
      return true;
    } catch {
      listenerId = null;
      return false;
    }
  }

  return { publish, start, stop };
}
