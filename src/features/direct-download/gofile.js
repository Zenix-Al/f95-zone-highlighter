import { config } from "../../config";
import { debugLog } from "../../core/logger";
import TIMINGS from "../../config/timings.js";
import { SELECTORS } from "../../config/selectors.js";
import { showToast } from "../../ui/components/toast.js";
import { publishDirectDownloadAttention } from "./attention.js";
import { isDirectDownloadHostEnabled } from "./hostPackages.js";
import {
  clearProcessingAndTryCloseTab,
  clearProcessingDownloadFlag,
} from "./hostFlowHelpers.js";

export async function processGofileDownload() {
  if (
    !config.threadSettings.directDownloadLinks ||
    !config.processingDownload ||
    !isDirectDownloadHostEnabled(location.hostname)
  )
    return;

  const AUTO_CLOSE_DELAY = TIMINGS.GOFILE_AUTO_CLOSE;

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
      await publishDirectDownloadAttention("gofile.io", msg, "host_blocked");
      await clearProcessingDownloadFlag();
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
      await publishDirectDownloadAttention(
        "gofile.io",
        "No downloadable item found. Download manually from host page.",
        "no_items",
      );
      await clearProcessingDownloadFlag();
      return;
    }

    if (itemElements.length > 1) {
      debugLog("GofileDownloader", "Multiple files detected; auto-download skipped");
      await publishDirectDownloadAttention(
        "gofile.io",
        "Multiple files detected. Manual download required.",
        "multiple_items",
      );
      await clearProcessingDownloadFlag();
      showToast("Multiple files detected; download manually for now.");
      return;
    }

    const contentId = itemElements[0].getAttribute("data-item-id");
    if (!contentId) {
      throw new Error("data-item-id exists but is empty");
    }

    if (typeof unsafeWindow.downloadContent !== "function") {
      debugLog("GofileDownloader", "downloadContent is not available");
      const msg = "downloadContent not found; host page likely changed.";
      showToast(msg);
      await publishDirectDownloadAttention("gofile.io", msg, "missing_download_api");
      await clearProcessingDownloadFlag();
      return;
    }

    debugLog("GofileDownloader", `Triggering downloadContent(${contentId})`);
    unsafeWindow.downloadContent(contentId);

    setTimeout(async () => {
      debugLog("GofileDownloader", "Download triggered; resetting processing flag");
      await clearProcessingAndTryCloseTab();
    }, AUTO_CLOSE_DELAY);
  } catch (err) {
    debugLog("GofileDownloader", `Failed: ${err.message}`);
    const msg = `Downloader failed: ${err.message}`;
    showToast(msg);
    await publishDirectDownloadAttention("gofile.io", msg, "exception");
    await clearProcessingDownloadFlag();
  }
}
