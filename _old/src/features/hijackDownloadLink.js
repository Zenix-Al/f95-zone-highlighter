import {
  cache,
  colorState,
  config,
  state,
  supportedDirectDownload,
  supportedHosts,
  timeoutMS,
  typeDownload,
} from "../constants";
import { saveConfigKeys } from "../core/save";
import { showToast } from "../core/ui/modal";
import { debugLog } from "../core/debugOutput";
import { injectFrame } from "./iframe";
import { openInNewTabHelper } from "./openInNewTabHelper";
export function isSupportedDownloadLink(urlString) {
  if (!urlString) return false;

  let url;
  try {
    url = new URL(urlString);
  } catch (err) {
    debugLog("HijackDownloadLink", `Invalid URL: ${urlString} - ${err}`);
    return false;
  }

  const linkHost = url.hostname.toLowerCase();
  if (linkHost.includes("f95zone.to")) return false;
  if (supportedHosts.some((h) => linkHost.includes(h) || linkHost.endsWith("." + h))) {
    return true;
  }

  if (
    supportedDirectDownload.some(
      (cfg) => linkHost.includes(cfg.host) || linkHost.endsWith("." + cfg.host)
    )
  ) {
    return true;
  }

  return false;
}

export function getSupportedLinkType(urlString) {
  if (!urlString) return null;

  let url;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }

  const linkHost = url.hostname.toLowerCase();

  if (supportedHosts.some((h) => linkHost.includes(h) || linkHost.endsWith("." + h))) {
    if (typeDownload.find((t) => t.id === linkHost)?.type === "iframe") {
      return "iframe";
    }
    return "normal";
  }

  if (
    supportedDirectDownload.some(
      (cfg) => linkHost.includes(cfg.host) || linkHost.endsWith("." + cfg.host)
    )
  ) {
    return "direct";
  }

  return null;
}
let clickHandlerDD = null;
export function hicjackLink() {
  if (state.isDirectDownloadHijackApplied) return;
  state.isDirectDownloadHijackApplied = true;
  function handler(e) {
    const el = e.target.closest("a[href]");
    if (!el) return;
    const url = el.href.trim();
    if (!isSupportedDownloadLink(url)) return;
    debugLog("HijackDownloadLink", `Hijacking download link: ${url}`);
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
    } else if (type == "direct") {
      showToast("Direct download started...");
      injectFrame(url, { onSuccess: () => showToast("Direct download initiated.") });
      setTimeout(() => {
        showToast("if download not started, open link in new tab.");
        showToast("Feedback appreciated to improve accuracy.");
      }, 8000);
    } else if (type == "normal") {
      showToast("Processing download in new tab...");
      showToast("you'll alered if download starts or fails");
      //important so if script loaded on new tab it must process the download
      saveConfigKeys({ processingDownload: true });
      setInterval(() => {
        saveConfigKeys({ processingDownload: false });
      }, 10000); // reset after 10s
      openInNewTabHelper(url);
    }
  }
  clickHandlerDD = handler;
  document.addEventListener("click", clickHandlerDD, true);
}

export function disableHijackLink() {
  if (!state.isDirectDownloadHijackApplied) return;
  if (clickHandlerDD) {
    document.removeEventListener("click", clickHandlerDD, true);
    clickHandlerDD = null;
  }
  state.isDirectDownloadHijackApplied = false;
}

export function toggleDirectDownloadHijack() {
  if (config.threadSettings.directDownloadLinks) {
    hicjackLink();
  } else {
    disableHijackLink();
  }
}
