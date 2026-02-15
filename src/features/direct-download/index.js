import stateManager, { cache, colorState, downloadHostConfigs, timeoutMS } from "../../config.js";
import { saveConfigKeys } from "../../services/settingsService";
import { showToast } from "../../ui/components/toast";
import { debugLog } from "../../core/logger";
import { injectFrame } from "./iframe";
import { openInNewTabHelper } from "../../core/openInNewTabHelper";
import { addListener, removeListener } from "../../core/listenerRegistry.js";
import { disableMsgEventHandler, handleMsgEvent } from "./msgHandler";
import { createFeature } from "../../core/featureFactory.js";
import resourceManager from "../../core/resourceManager.js";
import TIMINGS from "../../config/timings.js";
import { notify } from "../../services/notificationService.js";

const DIRECT_DOWNLOAD_ATTENTION_KEY = "directDownloadAttentionEvent";
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

function getDownloadLinkInfo(urlString) {
  if (!urlString) return false;

  let url;
  try {
    url = new URL(urlString);
  } catch (err) {
    debugLog("DirectDownload", `Invalid URL: ${urlString} - ${err}`);
    return null;
  }

  const linkHost = url.hostname.toLowerCase();
  if (linkHost.includes("f95zone.to")) return null;

  for (const host in downloadHostConfigs) {
    if (linkHost.includes(host)) {
      const hostConfig = downloadHostConfigs[host];
      // Ensure it's a host we intend to hijack clicks for
      if (hostConfig.clickType) {
        return { type: hostConfig.clickType };
      }
    }
  }

  return null;
}

export function isSupportedDownloadLink(urlString) {
  return getDownloadLinkInfo(urlString) !== null;
}

export function getSupportedLinkType(urlString) {
  const info = getDownloadLinkInfo(urlString);
  return info ? info.type : null;
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
    const type = getSupportedLinkType(url);
    if (type == "iframe") {
      el.dataset.state = "pending";
      el.style.color = colorState.PENDING.color;

      const frame = injectFrame(url);

      const timer = setTimeout(() => {
        if (el.dataset.state !== "resolved") {
          el.dataset.state = "";
          el.style.color = colorState.FAILED.color;
          if (frame) frame.remove();
          cache.delete(url);
          // cleanup any registered resource for this url
          try {
            resourceManager.cleanup(`direct-download:${encodeURIComponent(url)}`);
          } catch {}
          window.open(url, "_blank"); // fallback also new tab
        }
      }, timeoutMS);

      cache.set(url, { el, frame, timer });
      // Register a cleanup hook for this pending download context
      const resourceId = `direct-download:${encodeURIComponent(url)}`;
      resourceManager.register(resourceId, () => {
        try {
          const ctx = cache.get(url);
          if (ctx) {
            clearTimeout(ctx.timer);
            if (ctx.frame) ctx.frame.remove();
            cache.delete(url);
          }
        } catch (err) {
          debugLog("DirectDownload", `Cleanup failed for ${url}: ${err}`);
        }
      });
    } else if (type == "normal") {
      showToast("Processing download in new tab...");
      showToast("you'll alered if download starts or fails");
      // Persist before opening tab so download-page loader can read it reliably.
      await saveConfigKeys({ processingDownload: true });
      setTimeout(() => saveConfigKeys({ processingDownload: false }), TIMINGS.DOWNLOAD_TIMEOUT); // reset after configured delay
      openInNewTabHelper(url);
    }
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
