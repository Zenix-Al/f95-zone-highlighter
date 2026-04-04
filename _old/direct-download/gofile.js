import { config } from "../../config";
import { debugLog } from "../../core/logger";
import TIMINGS from "../../config/timings.js";
import { SELECTORS } from "../../config/selectors.js";
import { showToast } from "../../ui/components/toast.js";
import { handleDirectDownloadFailure } from "./attention.js";
import { isDirectDownloadHostEnabled } from "./hostPackages.js";
import {
  isProcessingDownloadFlowActive,
  invokeGofileDownloadContent,
  markHostDownloadSuccess,
  scheduleDirectDownloadCompletion,
} from "./hostFlowHelpers.js";

export async function processGofileDownload() {
  const isProcessing = await isProcessingDownloadFlowActive();
  if (
    !config.threadSettings.directDownloadLinks ||
    !isProcessing ||
    !isDirectDownloadHostEnabled(location.hostname)
  )
    return;

  const AUTO_CLOSE_DELAY = TIMINGS.GOFILE_AUTO_CLOSE;
  const failAndExit = async (message, code) => {
    await handleDirectDownloadFailure({
      packageKey: "gofile",
      host: "gofile.io",
      message,
      code,
      trippedToast: "Gofile auto-disabled after 3 consecutive failures.",
    });
  };

  const waitForContentReady = (timeout = 20000) => {
    return new Promise((resolve, reject) => {
      const start = Date.now();

      const check = () => {
        const loading = document.querySelector(SELECTORS.GOFILE.LOADING);
        const itemsList = document.querySelector(SELECTORS.GOFILE.ITEMS_LIST);

        const isReady =
          (!loading || getComputedStyle(loading).display === "none") &&
          itemsList &&
          itemsList.children.length > 0;

        if (isReady) {
          debugLog("GofileDownloader", "Content ready: items list populated");
          resolve(true);
          return;
        }

        if (Date.now() - start > timeout) {
          reject(new Error("Timeout waiting for content to render"));
          return;
        }

        setTimeout(check, TIMINGS.POLL_INTERVAL);
      };

      check();
    });
  };

  try {
    debugLog("GofileDownloader", "Starting goFile auto-download process...");
    await waitForContentReady();
    await new Promise((r) => setTimeout(r, TIMINGS.GOFILE_POST_READY_WAIT));

    const alertEl = document.querySelector(SELECTORS.GOFILE.ALERT);
    if (alertEl && getComputedStyle(alertEl).display !== "none") {
      debugLog("GofileDownloader", "Host alert visible: file/folder unavailable");
      const msg = "File removed or blocked on host.";
      showToast(msg);
      await failAndExit(msg, "host_blocked");
      return;
    }

    const itemsList = document.querySelector(SELECTORS.GOFILE.ITEMS_LIST);
    if (!itemsList) {
      throw new Error("No #filemanager_itemslist found");
    }

    const itemElements = itemsList.querySelectorAll("[data-item-id]");
    debugLog("GofileDownloader", `Found ${itemElements.length} item(s) with data-item-id`);

    if (itemElements.length === 0) {
      debugLog("GofileDownloader", "No downloadable items found");
      await failAndExit(
        "No downloadable item found. Download manually from host page.",
        "no_items",
      );
      return;
    }

    if (itemElements.length > 1) {
      debugLog("GofileDownloader", "Multiple files detected; auto-download skipped");
      await failAndExit("Multiple files detected. Manual download required.", "multiple_items");
      showToast("Multiple files detected; download manually for now.");
      return;
    }

    const contentId = itemElements[0].getAttribute("data-item-id");
    if (!contentId) {
      throw new Error("data-item-id exists but is empty");
    }

    const bridgeResult = await invokeGofileDownloadContent(contentId);
    if (!bridgeResult.ok) {
      debugLog("GofileDownloader", "downloadContent bridge is not available");
      const msg = `downloadContent bridge unavailable (${bridgeResult.reason || "unknown"}); host page likely changed.`;
      await failAndExit(msg, "missing_download_api");
      return;
    }

    debugLog(
      "GofileDownloader",
      `Triggering downloadContent(${contentId}) via ${bridgeResult.source}`,
    );
    await markHostDownloadSuccess("gofile");

    scheduleDirectDownloadCompletion("GofileDownloader", AUTO_CLOSE_DELAY);
  } catch (err) {
    debugLog("GofileDownloader", `Failed: ${err.message}`);
    const msg = `Downloader failed: ${err.message}`;
    await failAndExit(msg, "exception");
  }
}
