import stateManager from "../../config.js";
import { showToast } from "../../ui/components/toast";
import { debugLog } from "../../core/logger";
import { addListener, removeListener } from "../../core/listenerRegistry.js";
import { disableMsgEventHandler, handleMsgEvent } from "./msgHandler";
import { createFeature } from "../../core/featureFactory.js";
import { notify } from "../../services/notificationService.js";
import { isSupportedDownloadLink, routeDownloadUrl } from "../../services/downloadRouter.js";
import { DIRECT_DOWNLOAD_ATTENTION_KEY } from "./attention.js";
let directDownloadAttentionListenerId = null;
let lastAttentionTimestamp = 0;

function showAttentionNotice(payload) {
  if (!payload || typeof payload !== "object") return;

  const ts = Number(payload.ts || 0);
  if (Number.isFinite(ts) && ts > 0) {
    if (ts <= lastAttentionTimestamp) return;
    lastAttentionTimestamp = ts;
  }

  const message =
    typeof payload.message === "string" && payload.message.trim().length > 0
      ? payload.message.trim()
      : "Direct download needs manual action.";

  showToast(`Direct Download: ${message}`, 6000);
  try {
    notify("Direct Download Attention", message);
  } catch {
    // best-effort
  }
}

function enableDirectDownloadAttentionListener() {
  if (directDownloadAttentionListenerId !== null) return;
  if (typeof GM_addValueChangeListener !== "function") return;

  directDownloadAttentionListenerId = GM_addValueChangeListener(
    DIRECT_DOWNLOAD_ATTENTION_KEY,
    (_name, _oldVal, newVal, remote) => {
      if (!remote) return;
      showAttentionNotice(newVal);
    },
  );
}

function disableDirectDownloadAttentionListener() {
  if (directDownloadAttentionListenerId === null) return;
  if (typeof GM_removeValueChangeListener === "function") {
    GM_removeValueChangeListener(directDownloadAttentionListenerId);
  }
  directDownloadAttentionListenerId = null;
}

const HIJACK_LISTENER_ID = "direct-download-hijack";
function enableDirectDownload() {
  if (stateManager.get("isDirectDownloadHijackApplied")) return;
  stateManager.set("isDirectDownloadHijackApplied", true);

  async function handler(e) {
    const el = e.target.closest("a[href]");
    if (!el) return;
    const url = el.href.trim();
    if (!isSupportedDownloadLink(url)) return;
    debugLog("DirectDownload", `Hijacking download link: ${url}`);
    e.preventDefault();
    await routeDownloadUrl(url, { anchorEl: el, fallbackToNewTab: true });
  }
  addListener(HIJACK_LISTENER_ID, document, "click", handler, { capture: true });
}

function disableDirectDownload() {
  if (!stateManager.get("isDirectDownloadHijackApplied")) return;
  removeListener(HIJACK_LISTENER_ID);
  stateManager.set("isDirectDownloadHijackApplied", false);
}

function enable() {
  enableDirectDownload();
  enableDirectDownloadAttentionListener();
  handleMsgEvent();
}

function disable() {
  disableDirectDownload();
  disableDirectDownloadAttentionListener();
  disableMsgEventHandler();
}

export const directDownloadFeature = createFeature("Direct Download", {
  configPath: "threadSettings.directDownloadLinks",
  enable: enable,
  disable: disable,
});
