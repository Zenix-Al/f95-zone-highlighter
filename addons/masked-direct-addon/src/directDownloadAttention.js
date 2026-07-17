import {
  getRouteOriginTabId,
  getRouteRequestId,
} from "./ports/routeContextRepository.js";

const DIRECT_DOWNLOAD_EVENT_KEY =
  "f95ue.addon.maskedDirect.directDownloadEvent";
const DIRECT_DOWNLOAD_TAB_ID_KEY = "f95ue.addon.directDownload.tabId";
const ORIGIN_TAB_QUERY_KEY = "f95ue_tab";
const DIRECT_DOWNLOAD_EVENT_TTL_MS = 2 * 60 * 1000;
const DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY = "f95ue_dd_req";

function getLocalAttentionTabId() {
  try {
    const existing = sessionStorage.getItem(DIRECT_DOWNLOAD_TAB_ID_KEY);
    if (existing && existing.trim()) return existing;
    const generated = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(DIRECT_DOWNLOAD_TAB_ID_KEY, generated);
    return generated;
  } catch {
    return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function getOriginTabIdFromLocation() {
  return getRouteOriginTabId(ORIGIN_TAB_QUERY_KEY);
}

function createEventId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDirectDownloadAttentionController({
  addTeardown,
  showToast,
  GMApi,
  addValueChangeListener,
  removeValueChangeListener,
  closeManagedTab,
}) {
  let eventListenerId = null;
  let lastEventTs = 0;
  let lastEventId = "";
  const localAttentionTabId = getLocalAttentionTabId();

  function shouldAcceptEvent(payload, remote) {
    if (!payload || typeof payload !== "object") return;
    if (remote === false) return false;

    const targetTabId = String(payload.targetTabId || "").trim();
    if (targetTabId && targetTabId !== localAttentionTabId) return false;

    const ts = Number(payload.ts || 0);
    if (Number.isFinite(ts) && ts > 0) {
      const ageMs = Date.now() - ts;
      if (Number.isFinite(ageMs) && ageMs > DIRECT_DOWNLOAD_EVENT_TTL_MS)
        return false;
      if (ts < lastEventTs) return false;
      lastEventTs = ts;
    }

    const eventId = String(payload.id || "").trim();
    if (eventId && eventId === lastEventId) return false;
    if (eventId) lastEventId = eventId;

    return true;
  }

  function showDirectDownloadEvent(payload, remote) {
    if (!shouldAcceptEvent(payload, remote)) return;

    const type = String(payload.type || "attention").trim();
    if (type === "close-tab") {
      const requestId = String(payload.requestId || "").trim();
      if (typeof closeManagedTab === "function") {
        closeManagedTab(requestId);
      }
      return;
    }

    const host = String(payload.host || "unknown").trim();
    const message = String(
      payload.message || "Direct download needs manual action.",
    ).trim();
    if (!message) return;

    if (type === "success") {
      showToast(`Direct Download (${host}): ${message}`, 3200, "success");
      return;
    }

    showToast(`Direct Download (${host}): ${message}`, 6000, "error");
  }

  async function publishDirectDownloadEvent({
    type = "attention",
    host = "unknown",
    message = "Direct download needs manual action.",
    errorCode = "",
    requestId = "",
  } = {}) {
    if (!GMApi || typeof GMApi.setValue !== "function") return;
    let resolvedRequestId = String(requestId || "").trim();
    try {
      if (!resolvedRequestId) {
        resolvedRequestId = String(
          new URL(location.href).searchParams.get(
            DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY,
          ) || "",
        ).trim();
      }
    } catch {
      // keep requestId as-is
    }
    if (!resolvedRequestId) {
      resolvedRequestId = getRouteRequestId();
    }
    const payload = {
      ts: Date.now(),
      id: createEventId(),
      type: String(type || "attention"),
      host: String(host || "unknown"),
      code: String(errorCode || "unknown_error"),
      message: String(message || "Direct download needs manual action."),
      href: location.href,
      targetTabId: getOriginTabIdFromLocation() || "",
      requestId: resolvedRequestId || createEventId(),
    };
    try {
      await GMApi.setValue(DIRECT_DOWNLOAD_EVENT_KEY, payload);
      console.info(
        "[DirectDownloadBus] Published event:",
        payload.type,
        payload.code,
        "to target tab:",
        payload.targetTabId,
      );
    } catch (err) {
      console.warn("[DirectDownloadBus] Failed to publish event:", err);
    }
  }

  function publishDirectDownloadAttention(
    host,
    message,
    errorCode = "",
    requestId = "",
  ) {
    return publishDirectDownloadEvent({
      type: "failure",
      host,
      message,
      errorCode,
      requestId,
    });
  }

  function disableDirectDownloadEventListener() {
    if (eventListenerId === null) return;
    if (typeof removeValueChangeListener === "function") {
      removeValueChangeListener(eventListenerId);
    }
    eventListenerId = null;
  }

  function enableDirectDownloadAttentionListener({ shouldListen }) {
    if (typeof shouldListen === "function" && !shouldListen()) return;
    if (eventListenerId !== null) return;
    if (typeof addValueChangeListener !== "function") return;

    eventListenerId = addValueChangeListener(
      DIRECT_DOWNLOAD_EVENT_KEY,
      (_name, _oldVal, newVal, remote) => {
        showDirectDownloadEvent(newVal, remote);
      },
    );

    addTeardown(disableDirectDownloadEventListener);
  }

  return {
    disableDirectDownloadEventListener,
    enableDirectDownloadAttentionListener,
    localAttentionTabId,
    originTabQueryKey: ORIGIN_TAB_QUERY_KEY,
    publishDirectDownloadAttention,
    publishDirectDownloadEvent,
  };
}
