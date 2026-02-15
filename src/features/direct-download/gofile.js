import { config } from "../../config";
import { saveConfigKeys } from "../../services/settingsService";
import { debugLog } from "../../core/logger";
import TIMINGS from "../../config/timings.js";
import { SELECTORS } from "../../config/selectors.js";
import { styleDownloadSuccess } from "../../utils/helpers.js";
import { showToast } from "../../ui/components/toast.js";

const DIRECT_DOWNLOAD_ATTENTION_KEY = "directDownloadAttentionEvent";

async function publishAttention(message, code = "manual_required") {
  const safeMessage = String(message || "Direct download needs manual action.");
  try {
    await saveConfigKeys({
      [DIRECT_DOWNLOAD_ATTENTION_KEY]: {
        ts: Date.now(),
        host: "gofile.io",
        code,
        message: safeMessage,
        href: location.href,
      },
    });
  } catch {
    // best-effort
  }
}

export async function processGofileDownload() {
  if (!config.threadSettings.directDownloadLinks || !config.processingDownload) return;

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
      await publishAttention(msg, "host_blocked");
      await saveConfigKeys({ processingDownload: false });
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
      await publishAttention("No downloadable item found. Download manually from host page.", "no_items");
      await saveConfigKeys({ processingDownload: false });
      return;
    }

    if (itemElements.length > 1) {
      debugLog("GofileDownloader", "Multiple files detected; auto-download skipped");
      await publishAttention("Multiple files detected. Manual download required.", "multiple_items");
      await saveConfigKeys({ processingDownload: false });
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
      await publishAttention(msg, "missing_download_api");
      await saveConfigKeys({ processingDownload: false });
      return;
    }

    debugLog("GofileDownloader", `Triggering downloadContent(${contentId})`);
    unsafeWindow.downloadContent(contentId);

    setTimeout(async () => {
      await saveConfigKeys({ processingDownload: false });
      debugLog("GofileDownloader", "Download triggered; resetting processing flag");

      try {
        window.close();
      } catch (e) {
        console.warn("Close blocked (normal if tab not script-opened)", e);
        const msg = document.createElement("div");
        msg.innerHTML = `
          <div>
            Download started! You can close this tab now.
          </div>
        `;
        const el = msg.firstElementChild;
        styleDownloadSuccess(el, { background: "#ec5555", color: "white" });
        document.body.appendChild(el);
      }
    }, AUTO_CLOSE_DELAY);
  } catch (err) {
    debugLog("GofileDownloader", `Failed: ${err.message}`);
    const msg = `Downloader failed: ${err.message}`;
    showToast(msg);
    await publishAttention(msg, "exception");
    await saveConfigKeys({ processingDownload: false });
  }
}
