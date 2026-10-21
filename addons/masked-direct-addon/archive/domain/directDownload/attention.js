import {
  getRouteOriginTabId,
  getRouteRequestId,
} from "../../ports/routeContextRepository.js";

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
  diagnostics,
  showCoreToast,
  GMApi,
  addValueChangeListener,
  removeValueChangeListener,
  closeManagedTab,
  debugLog,
}) {
  let eventListenerId = null;
  const handledEventIds = new Set();
  const handledEventOrder = [];
  const managedCloseTimers = new Map();
  const localAttentionTabId = getLocalAttentionTabId();

  function shouldAcceptEvent(payload, remote) {
    if (!payload || typeof payload !== "object") {
      debugLog?.("DirectDownloadBus", "Ignored invalid event payload.");
      return false;
    }
    if (remote === false) {
      debugLog?.("DirectDownloadBus", "Ignored same-tab event.", {
        type: payload.type,
        requestId: payload.requestId,
      });
      return false;
    }

    const targetTabId = String(payload.targetTabId || "").trim();
    if (targetTabId && targetTabId !== localAttentionTabId) {
      debugLog?.("DirectDownloadBus", "Ignored event for another tab.", {
        type: payload.type,
        requestId: payload.requestId,
        targetTabId,
        localAttentionTabId,
      });
      return false;
    }

    const ts = Number(payload.ts || 0);
    if (Number.isFinite(ts) && ts > 0) {
      const ageMs = Date.now() - ts;
      if (Number.isFinite(ageMs) && ageMs > DIRECT_DOWNLOAD_EVENT_TTL_MS) {
        debugLog?.("DirectDownloadBus", "Ignored expired event.", {
          type: payload.type,
          requestId: payload.requestId,
          ageMs,
        });
        return false;
      }
    }

    const eventId = String(payload.id || "").trim();
    if (eventId && handledEventIds.has(eventId)) {
      debugLog?.("DirectDownloadBus", "Ignored duplicate event.", {
        type: payload.type,
        requestId: payload.requestId,
        eventId,
      });
      return false;
    }
    if (eventId) {
      handledEventIds.add(eventId);
      handledEventOrder.push(eventId);
      if (handledEventOrder.length > 100) {
        handledEventIds.delete(handledEventOrder.shift());
      }
    }

    return true;
  }

  function showDirectDownloadEvent(payload, remote) {
    if (!shouldAcceptEvent(payload, remote)) return;

    const type = String(payload.type || "attention").trim();
    debugLog?.("DirectDownloadBus", "Accepted remote event.", {
      type,
      requestId: payload.requestId,
      targetTabId: payload.targetTabId,
      closeDelayMs: payload.closeDelayMs,
    });
    if (type === "close-tab") {
      const requestId = String(payload.requestId || "").trim();
      clearManagedCloseTimer(requestId);
      if (typeof closeManagedTab === "function") {
        const closed = closeManagedTab(requestId);
        debugLog?.("DirectDownloadBus", "Explicit close event handled.", {
          requestId,
          closed,
        });
      }
      return;
    }

    const host = String(payload.host || "unknown").trim();
    const message = String(
      payload.message || "Direct download needs manual action.",
    )
      .trim()
      .slice(0, 300);
    if (type === "success") {
      scheduleManagedClose(
        String(payload.requestId || "").trim(),
        Number(payload.closeDelayMs),
      );
      void showCoreToast?.(
        `Direct Download (${host}): ${message} The managed tab will close after the configured delay.`,
        "success",
      );
      return;
    }
    if (type === "challenge") {
      void showCoreToast?.(`Direct Download (${host}): ${message}`, "warning");
      return;
    }
    diagnostics.error(payload.code || "direct_download_failed", {
      host: payload.host,
      requestId: payload.requestId,
    });
    void showCoreToast?.(`Direct Download (${host}): ${message}`, "error");
  }

  async function publishDirectDownloadEvent({
    type = "attention",
    host = "unknown",
    message = "Direct download needs manual action.",
    errorCode = "",
    requestId = "",
    targetTabId = "",
    closeDelayMs = 0,
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
      targetTabId:
        String(targetTabId || "").trim() ||
        getOriginTabIdFromLocation() ||
        "",
      requestId: resolvedRequestId || createEventId(),
      closeDelayMs:
        Number.isFinite(Number(closeDelayMs)) && Number(closeDelayMs) >= 3000
          ? Math.round(Number(closeDelayMs))
          : 0,
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
    clearManagedCloseTimers();
    if (eventListenerId === null) return;
    if (typeof removeValueChangeListener === "function") {
      removeValueChangeListener(eventListenerId);
    }
    eventListenerId = null;
  }

  function clearManagedCloseTimer(requestId) {
    const id = String(requestId || "").trim();
    const timer = managedCloseTimers.get(id);
    if (timer === undefined) return;
    clearTimeout(timer);
    managedCloseTimers.delete(id);
  }

  function clearManagedCloseTimers() {
    for (const timer of managedCloseTimers.values()) clearTimeout(timer);
    managedCloseTimers.clear();
  }

  function scheduleManagedClose(requestId, delayMs) {
    const id = String(requestId || "").trim();
    if (
      !id ||
      typeof closeManagedTab !== "function" ||
      !Number.isFinite(delayMs) ||
      delayMs < 3000
    ) {
      debugLog?.("DirectDownloadBus", "Managed close fallback not scheduled.", {
        requestId: id,
        delayMs,
        hasCloseManagedTab: typeof closeManagedTab === "function",
      });
      return;
    }
    clearManagedCloseTimer(id);
    managedCloseTimers.set(
      id,
      setTimeout(() => {
        managedCloseTimers.delete(id);
        const closed = closeManagedTab(id);
        debugLog?.("DirectDownloadBus", "Managed close fallback fired.", {
          requestId: id,
          delayMs,
          closed,
        });
      }, delayMs),
    );
    debugLog?.("DirectDownloadBus", "Managed close fallback scheduled.", {
      requestId: id,
      delayMs,
    });
  }

  function enableDirectDownloadAttentionListener({ shouldListen }) {
    if (typeof shouldListen === "function" && !shouldListen()) return;
    if (eventListenerId !== null) return;
    if (typeof addValueChangeListener !== "function") return;

    eventListenerId = addValueChangeListener(
      DIRECT_DOWNLOAD_EVENT_KEY,
      (_name, _oldVal, newVal, remote) => {
        debugLog?.("DirectDownloadBus", "GM value-change callback received.", {
          remote,
          type: newVal?.type,
          requestId: newVal?.requestId,
          targetTabId: newVal?.targetTabId,
        });
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
