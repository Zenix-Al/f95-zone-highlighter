const DIRECT_DOWNLOAD_ATTENTION_KEY = "f95ue.addon.directDownloadAttentionEvent";
const DIRECT_DOWNLOAD_TAB_ID_KEY = "f95ue.addon.directDownload.tabId";
const ORIGIN_TAB_QUERY_KEY = "f95ue_tab";

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

  async function publishDirectDownloadAttention(host, message) {
    if (!GMApi || typeof GMApi.setValue !== "function") return;
    const payload = {
      ts: Date.now(),
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      host: String(host || "unknown"),
      message: String(message || "Direct download needs manual action."),
      href: location.href,
      targetTabId: getOriginTabIdFromLocation() || null,
    };
    try {
      await GMApi.setValue(DIRECT_DOWNLOAD_ATTENTION_KEY, payload);
    } catch {
      // best effort
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
