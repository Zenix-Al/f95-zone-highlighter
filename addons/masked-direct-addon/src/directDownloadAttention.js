const DIRECT_DOWNLOAD_ATTENTION_KEY = "directDownloadAttentionEvent";
const DIRECT_DOWNLOAD_TAB_ID_KEY = "f95ue.addon.directDownload.tabId";
const ORIGIN_TAB_QUERY_KEY = "f95ue_tab";
const DIRECT_DOWNLOAD_ATTENTION_TTL_MS = 2 * 60 * 1000;
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
  try {
    return String(new URL(location.href).searchParams.get(ORIGIN_TAB_QUERY_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function createDirectDownloadAttentionController({ addTeardown, showToast, GMApi }) {
  let attentionListenerId = null;
  let lastAttentionTs = 0;
  let lastAttentionId = "";
  const localAttentionTabId = getLocalAttentionTabId();

  function showAttentionNotice(payload) {
    if (!payload || typeof payload !== "object") return;
    const targetTabId = String(payload.targetTabId || "").trim();
    if (targetTabId && targetTabId !== localAttentionTabId) return;

    const ts = Number(payload.ts || 0);
    if (Number.isFinite(ts) && ts > 0) {
      const ageMs = Date.now() - ts;
      if (Number.isFinite(ageMs) && ageMs > DIRECT_DOWNLOAD_ATTENTION_TTL_MS) return;
      if (ts <= lastAttentionTs) return;
      lastAttentionTs = ts;
    }

    const eventId = String(payload.id || "").trim();
    if (eventId && eventId === lastAttentionId) return;
    if (eventId) lastAttentionId = eventId;

    const message = String(payload.message || "Direct download needs manual action.").trim();
    if (!message) return;
    showToast(`Direct Download: ${message}`, 6000);
  }

  async function publishDirectDownloadAttention(host, message, errorCode = "", requestIdOverride = "") {
    if (!GMApi || typeof GMApi.setValue !== "function") return;
    let requestId = String(requestIdOverride || "").trim();
    try {
      if (!requestId) {
        requestId = String(
          new URL(location.href).searchParams.get(DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY) || "",
        ).trim();
      }
    } catch {
      // keep requestId as-is
    }
    const payload = {
      ts: Date.now(),
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      host: String(host || "unknown"),
      code: String(errorCode || "unknown_error"),
      message: String(message || "Direct download needs manual action."),
      href: location.href,
      targetTabId: getOriginTabIdFromLocation() || "",
      requestId: requestId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    try {
      await GMApi.setValue(DIRECT_DOWNLOAD_ATTENTION_KEY, payload);
      console.info(
        "[Attention] Published event:",
        payload.code,
        "to target tab:",
        payload.targetTabId,
      );
    } catch (err) {
      console.warn("[Attention] Failed to publish event:", err);
    }
  }

  function enableDirectDownloadAttentionListener({ isThreadPage }) {
    if (!isThreadPage()) return;
    if (attentionListenerId !== null) return;
    if (typeof GM_addValueChangeListener !== "function") return;
    attentionListenerId = GM_addValueChangeListener(
      DIRECT_DOWNLOAD_ATTENTION_KEY,
      (_name, _oldVal, newVal, remote) => {
        if (!remote) return;
        showAttentionNotice(newVal);
      },
    );
    addTeardown(() => {
      if (attentionListenerId === null) return;
      if (typeof GM_removeValueChangeListener === "function") {
        GM_removeValueChangeListener(attentionListenerId);
      }
      attentionListenerId = null;
    });
  }

  return {
    enableDirectDownloadAttentionListener,
    localAttentionTabId,
    originTabQueryKey: ORIGIN_TAB_QUERY_KEY,
    publishDirectDownloadAttention,
  };
}
