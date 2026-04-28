import {
  clearProcessingDownloadTrigger,
  setProcessingDownloadTrigger,
} from "./processingDownloadTrigger.js";

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
    if (supported && safeUrl) {
      try {
        const parsed = new URL(safeUrl);
        if (!parsed.searchParams.get(originTabQueryKey)) {
          parsed.searchParams.set(originTabQueryKey, ownerTabId);
        }
        safeUrl = parsed.href;
      } catch {
        // keep safeUrl as-is
      }
    }
    if (!safeUrl) return;

    if (supported) {
      await setProcessingDownloadTrigger(GMApi, {
        host,
        sourceUrl: safeUrl,
        ownerTabId,
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

  async function notifyMainFailure(hostLabel, message) {
    const text = `Direct download (${hostLabel}) failed: ${String(message || "unknown error")}`;
    showToast(text, 4200);
    await clearProcessingDownloadTrigger(GMApi);
    await publishDirectDownloadAttention(hostLabel, text);

    bridge.dispatchCoreCommand("update-status", {
      addonId,
      status: "error",
      statusMessage: text,
    });
  }

  function reportAddonHealthy({ isEnabled, statusMessage }) {
    void clearProcessingDownloadTrigger(GMApi);
    bridge.dispatchCoreCommand("update-status", {
      addonId,
      status: isEnabled ? "installed" : "disabled",
      statusMessage,
    });

    if (getDownloadHost()) {
      setTimeout(() => window.close(), 1200);
    }
  }

  return {
    notifyMainFailure,
    openLinkNormally,
    reportAddonHealthy,
    routeToDirectDownload,
  };
}
