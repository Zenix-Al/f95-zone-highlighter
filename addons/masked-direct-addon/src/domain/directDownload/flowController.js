import {
  clearProcessingDownloadTrigger,
  readProcessingDownloadTrigger,
  setProcessingDownloadTrigger,
} from "../../ports/processingDownloadRepository.js";
import {
  DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY,
  DIRECT_DOWNLOAD_ROUTE_TS_KEY,
} from "../../constants.js";
import { storeDownloadPageCloseDelay } from "../../ports/downloadSettingsRepository.js";
import { smartCloseWhenReady } from "./detectors.js";
import { normalizeDirectDownloadHost } from "../../hosts/metadata.js";
import {
  clearRouteContext,
  getRouteRequestId,
} from "../../ports/routeContextRepository.js";

export function createDirectDownloadFlowController({
  addonId,
  bridge,
  GMApi,
  openInTab,
  normalizeUrl,
  withAutomationMarker,
  showToast,
  publishDirectDownloadAttention,
  publishDirectDownloadEvent,
  registerManagedTab,
  ownerTabId,
  originTabQueryKey,
  getDownloadHost,
  getDownloadPageCloseDelayMs,
}) {
  async function routeToDirectDownload(url) {
    const normalized = normalizeUrl(url, "");
    if (!normalized) return;

    let automationHost = "";
    try {
      automationHost = normalizeDirectDownloadHost(
        new URL(normalized).hostname,
      );
    } catch {
      automationHost = "";
    }

    const supported = Boolean(automationHost);
    let safeUrl = supported ? withAutomationMarker(normalized) : normalized;
    let requestId = "";
    if (supported && safeUrl) {
      try {
        const parsed = new URL(safeUrl);
        if (!parsed.searchParams.get(originTabQueryKey)) {
          parsed.searchParams.set(originTabQueryKey, ownerTabId);
        }
        if (!parsed.searchParams.get(DIRECT_DOWNLOAD_ROUTE_TS_KEY)) {
          parsed.searchParams.set(
            DIRECT_DOWNLOAD_ROUTE_TS_KEY,
            String(Date.now()),
          );
        }
        const existingRequestId = String(
          parsed.searchParams.get(DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY) || "",
        ).trim();
        requestId =
          existingRequestId ||
          `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        if (!existingRequestId) {
          parsed.searchParams.set(
            DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY,
            requestId,
          );
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
        typeof getDownloadPageCloseDelayMs === "function"
          ? getDownloadPageCloseDelayMs()
          : 3500;
      await storeDownloadPageCloseDelay(GMApi, delay);
      console.info(
        "[DirectDownload] Stored close delay in GM storage: " + delay + "ms",
      );

      await setProcessingDownloadTrigger(GMApi, {
        host: automationHost,
        sourceUrl: safeUrl,
        ownerTabId,
        requestId,
      });
    }

    if (supported && typeof openInTab === "function") {
      const tab = openInTab(safeUrl, {
        active: false,
        insert: true,
        setParent: true,
      });
      if (requestId && typeof registerManagedTab === "function") {
        registerManagedTab(requestId, tab);
      }
      return;
    }

    window.open(safeUrl, "_blank", "noopener,noreferrer");
  }

  function openLinkNormally(url, anchorEl = null) {
    const safeUrl = normalizeUrl(url, "");
    if (!safeUrl) return;

    const target = String(
      anchorEl?.getAttribute?.("target") || "",
    ).toLowerCase();
    if (target === "_blank") {
      window.open(safeUrl, "_blank", "noopener,noreferrer");
      return;
    }

    window.location.assign(safeUrl);
  }

  async function notifyMainFailure(hostLabel, message, errorCode = "") {
    const text = `Direct download (${hostLabel}) failed: ${String(message || "unknown error")}`;
    showToast(text, 4200);
    const routeRequestId = getCurrentRouteRequestId();
    const trigger = await readProcessingDownloadTrigger(GMApi, {
      requestId: routeRequestId,
    });
    const requestId = routeRequestId || trigger.requestId;
    await clearProcessingDownloadTrigger(GMApi, { requestId });
    await publishDirectDownloadAttention(
      hostLabel,
      message,
      errorCode,
      requestId,
    );
    clearRouteContext();

    if (!getDownloadHost()) {
      bridge.dispatchCoreCommand("update-status", {
        addonId,
        status: "error",
        statusMessage: text,
      });
    }
  }

  function reportAddonHealthy({
    isEnabled,
    statusMessage,
    downloadPageCloseDelayMs,
    closeOnTimeout = true,
    timeoutMessage = "Download was not confirmed before timeout.",
    requireDownloadConfirmation = false,
  }) {
    const downloadHost = getDownloadHost();
    if (!downloadHost) {
      void clearProcessingDownloadTrigger(GMApi);
      bridge.dispatchCoreCommand("update-status", {
        addonId,
        status: isEnabled ? "installed" : "disabled",
        statusMessage,
      });
    }

    if (downloadHost) {
      const delay =
        downloadPageCloseDelayMs ??
        (typeof getDownloadPageCloseDelayMs === "function"
          ? getDownloadPageCloseDelayMs()
          : 3500);

      const publishSuccess = async () => {
        const routeRequestId = await resolveCurrentRequestId();
        const requestId = routeRequestId;
        await clearProcessingDownloadTrigger(GMApi, { requestId });
        if (typeof publishDirectDownloadEvent === "function") {
          await publishDirectDownloadEvent({
            type: "success",
            host: downloadHost,
            message: "Download triggered.",
            requestId,
          });
        }
        clearRouteContext();
      };

      const resolveCurrentRequestId = async () => {
        if (resolvedRequestId) return resolvedRequestId;
        const routeRequestId = getCurrentRouteRequestId();
        const trigger = await readProcessingDownloadTrigger(GMApi, {
          requestId: routeRequestId,
        });
        resolvedRequestId = routeRequestId || trigger.requestId;
        return resolvedRequestId;
      };

      let resolvedRequestId = "";
      const requestManagedTabClose = async () => {
        const requestId = await resolveCurrentRequestId();
        if (typeof publishDirectDownloadEvent === "function") {
          await publishDirectDownloadEvent({
            type: "close-tab",
            host: downloadHost,
            message: "",
            requestId,
          });
        }
      };

      console.info(
        "[DirectDownload] Using smart close with delay: " + delay + "ms",
      );

      const closeTask = smartCloseWhenReady(
        delay,
        showToast,
        originTabQueryKey,
        {
          closeOnTimeout,
          timeoutMessage,
          requestManagedTabClose,
        },
      );

      if (!requireDownloadConfirmation) {
        void publishSuccess();
        return;
      }

      void (async () => {
        const confirmed = await closeTask;
        if (confirmed) {
          await publishSuccess();
          return;
        }

        const routeRequestId = getCurrentRouteRequestId();
        const trigger = await readProcessingDownloadTrigger(GMApi, {
          requestId: routeRequestId,
        });
        const requestId = routeRequestId || trigger.requestId;
        await clearProcessingDownloadTrigger(GMApi, { requestId });
        await publishDirectDownloadAttention(
          downloadHost,
          timeoutMessage,
          "download_not_confirmed",
          requestId,
        );
        clearRouteContext();
      })();
    }
  }

  return {
    notifyMainFailure,
    openLinkNormally,
    reportAddonHealthy,
    routeToDirectDownload,
  };
}

function getCurrentRouteRequestId() {
  return getRouteRequestId();
}
