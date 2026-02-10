import { cache, colorState, config, state, downloadHostConfigs, timeoutMS } from "../../config";
import { saveConfigKeys } from "../../services/settingsService";
import { showToast } from "../../ui/components/modal";
import { debugLog } from "../../core/logger";
import { injectFrame } from "./iframe";
import { openInNewTabHelper } from "../../core/openInNewTabHelper";
import { disableMsgEventHandler, handleMsgEvent } from "./msgHandler";

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
let clickHandler = null;
export function enableDirectDownload() {
  if (state.isDirectDownloadHijackApplied) return;
  state.isDirectDownloadHijackApplied = true;

  function handler(e) {
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
          window.open(url, "_blank"); // fallback also new tab
        }
      }, timeoutMS);

      cache.set(url, { el, frame, timer });
    } else if (type == "normal") {
      showToast("Processing download in new tab...");
      showToast("you'll alered if download starts or fails");
      //important so if script loaded on new tab it must process the download
      saveConfigKeys({ processingDownload: true });
      setTimeout(() => saveConfigKeys({ processingDownload: false }), 10000); // reset after 10s
      openInNewTabHelper(url);
    }
  }
  clickHandler = handler;
  document.addEventListener("click", clickHandler, true);
}

export function disableDirectDownload() {
  if (!state.isDirectDownloadHijackApplied) return;
  if (clickHandler) {
    document.removeEventListener("click", clickHandler, true);
    clickHandler = null;
  }
  state.isDirectDownloadHijackApplied = false;
}

export function toggleDirectDownload() {
  if (config.threadSettings.directDownloadLinks) {
    enableDirectDownload();
    handleMsgEvent();
  } else {
    disableDirectDownload();
    disableMsgEventHandler();
  }
}
