import { cache, colorState, downloadHostConfigs, timeoutMS } from "../config.js";
import TIMINGS from "../config/timings.js";
import { openInNewTabHelper } from "../core/openInNewTabHelper.js";
import resourceManager from "../core/resourceManager.js";
import { debugLog } from "../core/logger.js";
import { saveConfigKeys } from "./settingsService.js";
import { showToast } from "../ui/components/toast.js";
import { injectFrame } from "../features/direct-download/iframe.js";

function cleanupPendingContext(url) {
  const existing = cache.get(url);
  if (existing) {
    clearTimeout(existing.timer);
    if (existing.frame) existing.frame.remove();
    cache.delete(url);
  }

  try {
    resourceManager.cleanup(`direct-download:${encodeURIComponent(url)}`);
  } catch {
    // best-effort
  }
}

function registerPendingIframeContext(url, anchorEl) {
  cleanupPendingContext(url);

  anchorEl.dataset.state = "pending";
  anchorEl.style.color = colorState.PENDING.color;

  const frame = injectFrame(url);
  const timer = setTimeout(() => {
    if (anchorEl.dataset.state !== "resolved") {
      anchorEl.dataset.state = "";
      anchorEl.style.color = colorState.FAILED.color;
      if (frame) frame.remove();
      cache.delete(url);
      try {
        resourceManager.cleanup(`direct-download:${encodeURIComponent(url)}`);
      } catch {
        // best-effort
      }
      window.open(url, "_blank");
    }
  }, timeoutMS);

  cache.set(url, { el: anchorEl, frame, timer });

  const resourceId = `direct-download:${encodeURIComponent(url)}`;
  resourceManager.register(resourceId, () => {
    try {
      const ctx = cache.get(url);
      if (!ctx) return;
      clearTimeout(ctx.timer);
      if (ctx.frame) ctx.frame.remove();
      cache.delete(url);
    } catch (err) {
      debugLog("DownloadRouter", `Cleanup failed for ${url}: ${err}`);
    }
  });
}

export function getDownloadLinkInfo(urlString) {
  if (!urlString) return null;

  let url;
  try {
    url = new URL(urlString);
  } catch (err) {
    debugLog("DownloadRouter", `Invalid URL: ${urlString} - ${err}`);
    return null;
  }

  const linkHost = url.hostname.toLowerCase();
  if (linkHost.includes("f95zone.to")) return null;

  for (const host in downloadHostConfigs) {
    if (!linkHost.includes(host)) continue;
    const hostConfig = downloadHostConfigs[host];
    if (hostConfig.clickType) {
      return { type: hostConfig.clickType, host };
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

async function routeNormalDownload(
  urlString,
  {
    processingWindowMs = TIMINGS.DOWNLOAD_TIMEOUT,
    startMessage = "Processing download in new tab...",
    detailMessage = "you'll be alerted if download starts or fails",
  } = {},
) {
  showToast(startMessage);
  if (detailMessage) showToast(detailMessage);
  await saveConfigKeys({ processingDownload: true });
  setTimeout(() => {
    saveConfigKeys({ processingDownload: false });
  }, processingWindowMs);
  openInNewTabHelper(urlString);
}

export async function routeDownloadUrl(
  urlString,
  { anchorEl = null, fallbackToNewTab = true } = {},
) {
  const info = getDownloadLinkInfo(urlString);
  if (!info) {
    if (fallbackToNewTab) {
      window.open(urlString, "_blank");
      return { handled: true, type: "fallback" };
    }
    return { handled: false, type: null };
  }

  if (info.type === "iframe") {
    if (anchorEl) {
      registerPendingIframeContext(urlString, anchorEl);
    } else {
      injectFrame(urlString);
    }
    return { handled: true, type: "iframe" };
  }

  if (info.type === "normal") {
    const datanodesWindow =
      TIMINGS.DATANODES_BUTTON_WAIT_TIMEOUT +
      Math.max(6000, TIMINGS.DATANODES_SECOND_CLICK_DELAY) +
      TIMINGS.DATANODES_AUTO_CLOSE +
      3000;
    const processingWindowMs =
      info.host === "datanodes.to"
        ? Math.max(TIMINGS.DOWNLOAD_TIMEOUT, datanodesWindow)
        : TIMINGS.DOWNLOAD_TIMEOUT;
    await routeNormalDownload(urlString, { processingWindowMs });
    return { handled: true, type: "normal" };
  }

  if (fallbackToNewTab) {
    window.open(urlString, "_blank");
    return { handled: true, type: "fallback" };
  }

  return { handled: false, type: null };
}
