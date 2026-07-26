import {
  clearProcessingDownloadTrigger,
  readProcessingDownloadTrigger,
  setProcessingDownloadTrigger,
} from "../../ports/processingDownloadRepository.js";
import {
  DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY,
  DIRECT_DOWNLOAD_ROUTE_TS_KEY,
} from "../../constants.js";
import { closeManagedDownloadTabAfterDelay } from "./managedClose.js";
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
  diagnostics,
  publishDirectDownloadAttention,
  publishDirectDownloadEvent,
  registerManagedTab,
  ownerTabId,
  originTabQueryKey,
  getDownloadHost,
  getDownloadPageCloseDelayMs,
}) {
  let activeManagedRequest = null;

  function setActiveManagedRequest(request) {
    if (!request || typeof request !== "object") {
      activeManagedRequest = null;
      return;
    }
    const requestId = String(request.requestId || "").trim();
    if (!requestId) return;
    activeManagedRequest = {
      requestId,
      ownerTabId: String(request.ownerTabId || "").trim(),
      closeDelayMs: Number(request.closeDelayMs),
    };
  }

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
    const useRouteMarkers =
      supported &&
      !["download.gg", "drive.google.com"].includes(automationHost);
    let safeUrl = useRouteMarkers ? withAutomationMarker(normalized) : normalized;
    let requestId = "";
    if (supported && safeUrl) {
      try {
        const parsed = new URL(safeUrl);
        if (useRouteMarkers && !parsed.searchParams.get(originTabQueryKey)) {
          parsed.searchParams.set(originTabQueryKey, ownerTabId);
        }
        if (
          useRouteMarkers &&
          !parsed.searchParams.get(DIRECT_DOWNLOAD_ROUTE_TS_KEY)
        ) {
          parsed.searchParams.set(
            DIRECT_DOWNLOAD_ROUTE_TS_KEY,
            String(Date.now()),
          );
        }
        const existingRequestId = useRouteMarkers
          ? String(
              parsed.searchParams.get(DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY) ||
                "",
            ).trim()
          : "";
        requestId =
          existingRequestId ||
          `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        if (useRouteMarkers && !existingRequestId) {
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
      const delay =
        typeof getDownloadPageCloseDelayMs === "function"
          ? getDownloadPageCloseDelayMs()
          : 3500;

      await setProcessingDownloadTrigger(GMApi, {
        host: automationHost,
        sourceUrl: safeUrl,
        ownerTabId,
        requestId,
        closeDelayMs: delay,
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
    const routeRequestId = getCurrentRouteRequestId();
    const trigger = await readProcessingDownloadTrigger(GMApi, {
      requestId: routeRequestId,
    });
    const requestId = routeRequestId && trigger.active ? routeRequestId : "";
    diagnostics.error(errorCode || "direct_download_failed", {
      host: hostLabel,
      requestId,
    });
    await publishDirectDownloadEvent?.({
      type: "failure",
      host: hostLabel,
      message,
      errorCode,
      requestId,
      targetTabId: trigger.active ? trigger.ownerTabId : "",
    });
    if (requestId) await clearProcessingDownloadTrigger(GMApi, { requestId });
    clearRouteContext();

    if (!getDownloadHost()) {
      bridge.dispatchCoreCommand("update-status", {
        addonId,
        status: "error",
        statusMessage: text,
      });
    }
  }

  async function notifyMainChallenge(hostLabel, message) {
    const routeRequestId = getCurrentRouteRequestId();
    const trigger = await readProcessingDownloadTrigger(GMApi, {
      requestId: routeRequestId,
    });
    await publishDirectDownloadEvent?.({
      type: "challenge",
      host: hostLabel,
      message,
      errorCode: "cloudflare_challenge",
      requestId:
        routeRequestId && trigger.active ? routeRequestId : "",
      targetTabId: trigger.active ? trigger.ownerTabId : "",
    });
  }

  function reportAddonHealthy({
    isEnabled,
    statusMessage,
    downloadPageCloseDelayMs,
  }) {
    const downloadHost = getDownloadHost();
    if (!downloadHost) {
      bridge.dispatchCoreCommand("update-status", {
        addonId,
        status: isEnabled ? "installed" : "disabled",
        statusMessage,
      });
    }

    if (downloadHost) {
      const publishSuccess = async () => {
        const request = await resolveCurrentRequest();
        const requestId = request.requestId;
        if (typeof publishDirectDownloadEvent === "function") {
          await publishDirectDownloadEvent({
            type: "success",
            host: downloadHost,
            message: "Download triggered.",
            requestId,
            targetTabId: request.ownerTabId,
            closeDelayMs: request.closeDelayMs,
          });
        }
        if (requestId) await clearProcessingDownloadTrigger(GMApi, { requestId });
        activeManagedRequest = null;
        clearRouteContext();
      };

      const resolveCurrentRequest = async () => {
        if (resolvedRequest) return resolvedRequest;
        if (activeManagedRequest?.requestId) {
          resolvedRequest = { ...activeManagedRequest };
          return resolvedRequest;
        }
        const routeRequestId = getCurrentRouteRequestId();
        const trigger = await readProcessingDownloadTrigger(GMApi, {
          requestId: routeRequestId,
        });
        resolvedRequest =
          routeRequestId && trigger.active
            ? {
                requestId: routeRequestId,
                ownerTabId: trigger.ownerTabId,
                closeDelayMs: trigger.closeDelayMs,
              }
            : { requestId: "", ownerTabId: "", closeDelayMs: 0 };
        return resolvedRequest;
      };

      let resolvedRequest = null;
      const requestManagedTabClose = async () => {
        const request = await resolveCurrentRequest();
        if (typeof publishDirectDownloadEvent === "function") {
          await publishDirectDownloadEvent({
            type: "close-tab",
            host: downloadHost,
            message: "",
            requestId: request.requestId,
            targetTabId: request.ownerTabId,
          });
        }
      };

      void (async () => {
        const request = await resolveCurrentRequest();
        const requestId = request.requestId;
        const delay =
          requestId && Number.isFinite(request.closeDelayMs)
            ? request.closeDelayMs
            : downloadPageCloseDelayMs ??
              (typeof getDownloadPageCloseDelayMs === "function"
                ? getDownloadPageCloseDelayMs()
                : 3500);
        console.info(
          "[DirectDownload] Using request managed-tab close delay: " +
            delay +
            "ms",
        );
        void closeManagedDownloadTabAfterDelay(
          delay,
          originTabQueryKey,
          {
            requestManagedTabClose,
            managedRequestId: requestId,
          },
        );
        await publishSuccess();
      })();
    }
  }

  return {
    notifyMainChallenge,
    notifyMainFailure,
    openLinkNormally,
    reportAddonHealthy,
    routeToDirectDownload,
    setActiveManagedRequest,
  };
}

function getCurrentRouteRequestId() {
  return getRouteRequestId();
}
