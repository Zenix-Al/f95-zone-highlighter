import stateManager from "../../config.js";
import { showToast } from "../../ui/components/toast";
import { debugLog } from "../../core/logger";
import { disableMsgEventHandler, handleMsgEvent } from "./msgHandler";
import { createFeature } from "../../core/featureFactory.js";
import { notify } from "../../services/notificationService.js";
import { DIRECT_DOWNLOAD_ATTENTION_KEY, getDirectDownloadAttentionTabId } from "./attention.js";
import { getSafeTrimmedString } from "../../utils/typeHelpers.js";
import { executeAutoRetry } from "./autoRetryDownload.js";
import { handleDownload } from "./fileHostHelper.js";
let directDownloadAttentionListenerId = null;
let lastAttentionTimestamp = 0;
let lastAttentionId = "";
const localAttentionTabId = getDirectDownloadAttentionTabId();

function showAttentionNotice(payload) {
  if (!payload || typeof payload !== "object") return;

  const targetTabId = getSafeTrimmedString(payload.targetTabId, "");
  if (targetTabId && targetTabId !== localAttentionTabId) return;

  const ts = Number(payload.ts || 0);
  if (Number.isFinite(ts) && ts > 0) {
    if (ts <= lastAttentionTimestamp) return;
    lastAttentionTimestamp = ts;
  }

  const attentionId = getSafeTrimmedString(payload.id, "");
  if (attentionId && attentionId === lastAttentionId) return;
  if (attentionId) lastAttentionId = attentionId;

  const message = getSafeTrimmedString(payload.message, "Direct download needs manual action.");

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

function enable() {
  debugLog("DirectDownload", "Direct-download click hijack disabled; links keep native behavior.");
  enableDirectDownloadAttentionListener();
  handleMsgEvent();
}

function disable() {
  disableDirectDownloadAttentionListener();
  disableMsgEventHandler();
}

export const directDownloadFeature = createFeature("Direct Download", {
  configPath: "threadSettings.directDownloadLinks",
  isApplicable: ({ stateManager }) => stateManager.get("isThread"),
  enable: enable,
  disable: disable,
});

export const downloadPageFeature = createFeature("Download Page Handler", {
  isEnabled: () => true,
  isApplicable: ({ stateManager }) => Boolean(stateManager.get("isDownloadPage")),
  enable: () => {
    const downloadPageHost = stateManager.get("isDownloadPage");
    debugLog("Init", `Download page detected: ${downloadPageHost}`);
    handleDownload(downloadPageHost);
  },
  disable: () => {},
});

export const directDownloadAutoRetryFeature = createFeature("Direct Download Auto Retry", {
  isEnabled: () => true,
  isApplicable: ({ stateManager }) => Boolean(stateManager.get("isDirectDownloadPage")),
  enable: () => {
    const directDownloadHost = stateManager.get("isDirectDownloadPage");
    executeAutoRetry(directDownloadHost);
  },
  disable: () => {},
});
