/**
 * Download Detection Helper
 *
 * Detects if a download has been initiated by monitoring various signals.
 * Uses multiple detection strategies with fallback options.
 */

import {
  AUTOMATION_MARKER_KEY,
  DIRECT_DOWNLOAD_ROUTE_TS_KEY,
  DIRECT_DOWNLOAD_ROUTE_TTL_MS,
  TIMINGS,
} from "../../constants.js";
import { hasFreshRouteContext } from "../../ports/routeContextRepository.js";
import { sleep } from "../../shared/utils.js";

const DETECTOR_TIMEOUT_MS = 100; // Poll interval

/**
 * Creates a download detector that monitors HTTP responses for attachment headers.
 * This is the most reliable method as it intercepts the actual download response.
 *
 * @returns {{start: Function, stop: Function, detected: Function}}
 */
export function createContentDispositionDetector() {
  let downloadDetected = false;
  const originalFetch = window.fetch;
  const originalXhr = window.XMLHttpRequest?.prototype?.open;

  function onDownload() {
    downloadDetected = true;
  }

  return {
    /**
     * Start monitoring for Content-Disposition headers
     */
    start() {
      downloadDetected = false;

      // Intercept fetch requests
      window.fetch = async function (...args) {
        try {
          const response = await originalFetch.apply(this, args);
          const disposition = response.headers?.get?.("content-disposition");
          if (disposition?.toLowerCase?.().includes("attachment")) {
            onDownload();
          }
          return response;
        } catch (err) {
          throw err;
        }
      };

      // Intercept XMLHttpRequest (older sites might still use this)
      if (originalXhr) {
        window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
          const originalOnReadyStateChange = this.onreadystatechange;
          this.onreadystatechange = function () {
            if (this.readyState === 4) {
              const disposition = this.getResponseHeader?.(
                "content-disposition",
              );
              if (disposition?.toLowerCase?.().includes("attachment")) {
                onDownload();
              }
            }
            originalOnReadyStateChange?.call(this);
          };
          return originalXhr.apply(this, [method, url, ...rest]);
        };
      }
    },

    /**
     * Stop monitoring and restore original functions
     */
    stop() {
      try {
        window.fetch = originalFetch;
        if (originalXhr) {
          window.XMLHttpRequest.prototype.open = originalXhr;
        }
      } catch {
        // best effort cleanup
      }
    },

    /**
     * Check if download was detected
     * @returns {boolean}
     */
    detected() {
      return downloadDetected;
    },
  };
}

/**
 * Creates a download detector that monitors blob URL creation.
 * Useful for detecting programmatic downloads using download links.
 *
 * @returns {{start: Function, stop: Function, detected: Function}}
 */
export function createBlobDetector() {
  let downloadDetected = false;
  const originalCreateURL = URL.createObjectURL;
  const originalRevokeURL = URL.revokeObjectURL;

  function onDownload() {
    downloadDetected = true;
  }

  return {
    start() {
      downloadDetected = false;

      // Monitor blob URL creation
      URL.createObjectURL = function (blob) {
        if (blob instanceof Blob) {
          onDownload();
        }
        return originalCreateURL.apply(this, arguments);
      };

      // Optional: also monitor link creation patterns
      const originalCreateElement = document.createElement;
      document.createElement = function (tag) {
        const el = originalCreateElement.call(this, tag);
        if (tag?.toLowerCase?.() === "a") {
          const originalSetAttribute = el.setAttribute;
          el.setAttribute = function (name, value) {
            if (
              name?.toLowerCase?.() === "href" &&
              value?.startsWith?.("blob:")
            ) {
              onDownload();
            }
            return originalSetAttribute.apply(this, arguments);
          };
        }
        return el;
      };
    },

    stop() {
      try {
        URL.createObjectURL = originalCreateURL;
        URL.revokeObjectURL = originalRevokeURL;
      } catch {
        // best effort cleanup
      }
    },

    detected() {
      return downloadDetected;
    },
  };
}

/**
 * Main download detection orchestrator.
 * Monitors for download initiation and triggers callback when detected.
 * Supports multiple detection strategies running in parallel.
 *
 * @param {Function} onDetect - Callback when download is detected
 * @param {number} timeout - Maximum time to wait (ms)
 * @returns {Promise<boolean>} - True if download was detected, false if timeout
 */
export async function waitForDownloadDetection(onDetect, timeout = 5000) {
  // Start with most reliable detector (Content-Disposition)
  const detector = createContentDispositionDetector();

  let downloadDetected = false;
  const detectionListener = () => {
    if (detector.detected()) {
      downloadDetected = true;
      if (typeof onDetect === "function") {
        onDetect();
      }
    }
  };

  try {
    detector.start();

    const startTime = Date.now();
    while (!downloadDetected) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeout) {
        break;
      }
      detectionListener();
      await sleep(DETECTOR_TIMEOUT_MS);
    }

    return downloadDetected;
  } finally {
    detector.stop();
  }
}

/**
 * Smart page close with download detection.
 * Respects user's configured delay and closes immediately if download is detected.
 *
 * @param {number} userConfiguredDelayMs - User's max timeout (ms)
 * @param {Function} showToast - Optional toast callback for logging
 */
export async function smartCloseWhenReady(
  userConfiguredDelayMs = 3500,
  showToast,
  originTabQueryKey = "f95ue_tab",
  {
    closeOnTimeout = true,
    timeoutMessage = "Download was not confirmed before timeout.",
    requestManagedTabClose = null,
  } = {},
) {
  // SECURITY: Only close if this tab was opened by our addon
  // Check if both automation marker + origin tab marker exist in URL
  let isAddonManagedTab = false;
  try {
    const url = new URL(location.href);
    const hasOriginTabId = Boolean(url.searchParams.get(originTabQueryKey));
    const hasAutomationMarker =
      String(url.searchParams.get(AUTOMATION_MARKER_KEY) || "").trim() === "1";
    const routeTs = Number(
      url.searchParams.get(DIRECT_DOWNLOAD_ROUTE_TS_KEY) || 0,
    );
    const hasFreshRouteTs =
      Number.isFinite(routeTs) &&
      routeTs > 0 &&
      Date.now() - routeTs <= DIRECT_DOWNLOAD_ROUTE_TTL_MS;
    isAddonManagedTab =
      hasOriginTabId && hasAutomationMarker && hasFreshRouteTs;
    if (!isAddonManagedTab) {
      isAddonManagedTab = hasFreshRouteContext(originTabQueryKey);
    }
    console.info(
      "[Download Detector] Tab opened by addon:",
      isAddonManagedTab,
      "marker:",
      originTabQueryKey,
    );
  } catch (err) {
    console.error("[Download Detector] Error checking origin marker:", err);
    // If we can't verify, don't close
    return;
  }

  if (!isAddonManagedTab) {
    console.warn(
      "[Download Detector] Tab was NOT opened by addon, will NOT close",
    );
    console.warn(
      "[Download Detector] This prevents accidental closure of manually opened tabs",
    );
    return;
  }

  const POLL_INTERVAL = 100;
  const detector = createContentDispositionDetector();

  let downloadDetected = false;
  const onDownloadDetected = () => {
    downloadDetected = true;
    if (showToast) {
      showToast("Download confirmed, closing page shortly...");
    }
  };

  try {
    detector.start();
    console.info(
      "[Download Detector] Started monitoring, delay: " +
        userConfiguredDelayMs +
        "ms",
    );

    const startTime = Date.now();
    while (!downloadDetected) {
      const elapsed = Date.now() - startTime;

      // Check for download detection
      if (detector.detected()) {
        downloadDetected = true;
        console.info(
          "[Download Detector] Download DETECTED after " + elapsed + "ms",
        );
        onDownloadDetected();
        break;
      }

      // Check if timeout reached
      if (elapsed >= userConfiguredDelayMs) {
        console.info(
          "[Download Detector] Timeout reached (" +
            userConfiguredDelayMs +
            "ms), closeOnTimeout=" +
            closeOnTimeout,
        );
        break;
      }

      await sleep(POLL_INTERVAL);
    }

    if (downloadDetected) {
      console.info(
        "[Download Detector] Proceeding to close (download detected)",
      );
    } else {
      console.info(
        closeOnTimeout
          ? "[Download Detector] Proceeding to close (timeout)"
          : "[Download Detector] Download not confirmed; leaving page open",
      );
    }
  } catch (err) {
    console.error("[Download Detector] Error during monitoring:", err);
  } finally {
    try {
      detector.stop();
      console.info("[Download Detector] Detector stopped");
    } catch (err) {
      console.warn("[Download Detector] Error stopping detector:", err);
    }
  }

  if (!downloadDetected && !closeOnTimeout) {
    if (showToast) {
      showToast(timeoutMessage, 6000, "warning");
    }
    return false;
  }

  if (downloadDetected && TIMINGS.DOWNLOAD_DETECTED_CLOSE_GRACE_DELAY > 0) {
    console.info(
      "[Download Detector] Waiting " +
        TIMINGS.DOWNLOAD_DETECTED_CLOSE_GRACE_DELAY +
        "ms before closing after detection",
    );
    await sleep(TIMINGS.DOWNLOAD_DETECTED_CLOSE_GRACE_DELAY);
  }

  if (typeof requestManagedTabClose === "function") {
    try {
      await requestManagedTabClose({ downloadDetected });
      console.info("[Download Detector] Requested managed tab close");
    } catch (err) {
      console.warn(
        "[Download Detector] Managed tab close request failed:",
        err,
      );
    }
  }

  console.info("[Download Detector] Executing window.close()");
  try {
    setTimeout(() => window.close(), 100); // slight delay to avoid closing the tab too fast for the browser to process
  } catch (err) {
    console.error("[Download Detector] Failed to close window:", err);
  }

  // Fallback: If close didn't work, try hiding the page
  try {
    document.body.style.display = "none";
    console.info("[Download Detector] Hidden page as fallback");
  } catch {
    // best effort
  }

  return downloadDetected;
}
