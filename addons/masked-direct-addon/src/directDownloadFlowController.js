import {
  clearProcessingDownloadTrigger,
  readProcessingDownloadTrigger,
  setProcessingDownloadTrigger,
} from "./processingDownloadTrigger.js";
import {
  DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY,
  DIRECT_DOWNLOAD_ROUTE_TS_KEY,
  TIMINGS,
} from "./constants.js";
import { storeDownloadPageCloseDelay } from "./gmStorageHelper.js";
import { smartCloseWhenReady } from "./downloadDetector.js";

export function createDirectDownloadFlowController({
  addonId,
  bridge,
  GMApi,
  openInTab,
  normalizeUrl,
  withAutomationMarker,
  showToast,
  publishDirectDownloadAttention,
  ownerTabId,
  originTabQueryKey,
  getDownloadHost,
  getDownloadPageCloseDelayMs,
}) {
  function isSupportedHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    return (
      host.includes("buzzheavier.com") ||
      host.includes("gofile.io") ||
      host.includes("pixeldrain.com") ||
      host.includes("datanodes.to") ||
      host.includes("mediafire.com")
    );
  }

  async function routeToDirectDownload(url) {
    const normalized = normalizeUrl(url, "");
    if (!normalized) return;

    let host = "";
    try {
      host = new URL(normalized).hostname.toLowerCase();
    } catch {
      host = "";
    }

    const supported = isSupportedHost(host);
    let safeUrl = supported ? withAutomationMarker(normalized) : normalized;
    let requestId = "";
    if (supported && safeUrl) {
      try {
        const parsed = new URL(safeUrl);
        if (!parsed.searchParams.get(originTabQueryKey)) {
          parsed.searchParams.set(originTabQueryKey, ownerTabId);
        }
        if (!parsed.searchParams.get(DIRECT_DOWNLOAD_ROUTE_TS_KEY)) {
          parsed.searchParams.set(DIRECT_DOWNLOAD_ROUTE_TS_KEY, String(Date.now()));
        }
        const existingRequestId = String(parsed.searchParams.get(DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY) || "").trim();
        requestId = existingRequestId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        if (!existingRequestId) {
          parsed.searchParams.set(DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY, requestId);
        }
        safeUrl = parsed.href;
      } catch {
        // keep safeUrl as-is
      }
    }
    if (!safeUrl) return;

    if (supported) {
      // Get the configured delay and store it in GM storage for the download page to access
      const delay =
        typeof getDownloadPageCloseDelayMs === "function" ? getDownloadPageCloseDelayMs() : 3500;
      await storeDownloadPageCloseDelay(GMApi, delay);
      console.info("[DirectDownload] Stored close delay in GM storage: " + delay + "ms");

      await setProcessingDownloadTrigger(GMApi, {
        host,
        sourceUrl: safeUrl,
        ownerTabId,
        requestId,
      });
    }

    if (supported && typeof openInTab === "function") {
      openInTab(safeUrl, {
        active: false,
        insert: true,
        setParent: true,
      });
      return;
    }

    window.open(safeUrl, "_blank", "noopener,noreferrer");
  }

  function openLinkNormally(url, anchorEl = null) {
    const safeUrl = normalizeUrl(url, "");
    if (!safeUrl) return;

    const target = String(anchorEl?.getAttribute?.("target") || "").toLowerCase();
    if (target === "_blank") {
      window.open(safeUrl, "_blank", "noopener,noreferrer");
      return;
    }

    window.location.assign(safeUrl);
  }

  async function notifyMainFailure(hostLabel, message, errorCode = "") {
    const text = `Direct download (${hostLabel}) failed: ${String(message || "unknown error")}`;
    showToast(text, 4200);
    const trigger = await readProcessingDownloadTrigger(GMApi);
    await clearProcessingDownloadTrigger(GMApi);
    await publishDirectDownloadAttention(hostLabel, message, errorCode, trigger.requestId);

    bridge.dispatchCoreCommand("update-status", {
      addonId,
      status: "error",
      statusMessage: text,
    });
  }

  function reportAddonHealthy({ isEnabled, statusMessage, downloadPageCloseDelayMs }) {
    void clearProcessingDownloadTrigger(GMApi);
    bridge.dispatchCoreCommand("update-status", {
      addonId,
      status: isEnabled ? "installed" : "disabled",
      statusMessage,
    });

    if (getDownloadHost()) {
      const delay =
        downloadPageCloseDelayMs ??
        (typeof getDownloadPageCloseDelayMs === "function" ? getDownloadPageCloseDelayMs() : 3500);

      console.info("[DirectDownload] Using smart close with delay: " + delay + "ms");

      // Use smart close with download detection
      // This will close immediately if download is detected, or after delay if not
      void smartCloseWhenReady(delay, showToast, originTabQueryKey);
    }
  }

  return {
    notifyMainFailure,
    openLinkNormally,
    reportAddonHealthy,
    routeToDirectDownload,
  };
}
