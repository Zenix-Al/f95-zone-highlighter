import { config } from "../../config";
import { saveConfigKeys } from "../../services/settingsService";
import { debugLog } from "../../core/logger";
import TIMINGS from "../../config/timings.js";
import { SELECTORS } from "../../config/selectors.js";
import { styleDownloadSuccess } from "../../utils/helpers.js";

export async function processGofileDownload() {
  if (!config.threadSettings.directDownloadLinks || !config.processingDownload) return;

  const AUTO_CLOSE_DELAY = TIMINGS.GOFILE_AUTO_CLOSE; // 6 seconds — adjust if your downloads are slower/faster

  const waitForContentReady = (timeout = 20000) => {
    // bumped timeout a bit
    return new Promise((resolve, reject) => {
      const start = Date.now();

      const check = () => {
        const loading = document.querySelector(SELECTORS.GOFILE.LOADING);
        const itemsList = document.querySelector(SELECTORS.GOFILE.ITEMS_LIST);

        // Loading gone AND itemsList exists AND has children (or at least trying)
        const isReady =
          (!loading || getComputedStyle(loading).display === "none") &&
          itemsList &&
          itemsList.children.length > 0; // or querySelectorAll("[data-item-id]").length > 0 if you wanna be stricter

        if (isReady) {
          debugLog("GofileDownloader", "Content ready — itemsList has kids now 🔥");
          resolve(true);
          return;
        }

        if (Date.now() - start > timeout) {
          reject(new Error("Timeout waiting for actual content to render 😤"));
          return;
        }

        setTimeout(check, TIMINGS.POLL_INTERVAL); // poll every POLL_INTERVAL ms — not too aggressive
      };

      check();
    });
  };
  try {
    // gofile, just like most hosting page, almost anything is lazy loaded
    // expect many delays here and there
    debugLog("GofileDownloader", "Starting goFile auto-download process...");

    debugLog("GofileDownloader", "Waiting for loading spinner to fuck off...");
    await waitForContentReady(); // ← this bad boy waits properly
    await new Promise((r) => setTimeout(r, 600));

    const alertEl = document.querySelector(SELECTORS.GOFILE.ALERT);
    if (alertEl && getComputedStyle(alertEl).display !== "none") {
      debugLog("GofileDownloader", "Alert visible — file/folder taken down or restricted");
      alert("This shit got removed or blocked");
      await saveConfigKeys({ processingDownload: false }); // reset flag even on fail
      return;
    }

    const itemsList = document.querySelector(SELECTORS.GOFILE.ITEMS_LIST);
    if (!itemsList) {
      throw new Error("No #filemanager_itemslist found — page layout changed?");
    }

    const itemElements = itemsList.querySelectorAll("[data-item-id]");
    debugLog("GofileDownloader", `Found ${itemElements.length} item(s) with data-item-id`);

    if (itemElements.length === 0) {
      debugLog("GofileDownloader", "No downloadable items found ");
      await saveConfigKeys({ processingDownload: false });
      return;
    }

    if (itemElements.length > 1) {
      debugLog("GofileDownloader", "Multiple files detected — skipping auto-download for now");
      debugLog("GofileDownloader", "→ Future plan: batch download or picker UI");
      await saveConfigKeys({ processingDownload: false });
      //to gain user attention
      alert("Multiple files detected — download manually for now.");
      return;
    }

    // Single file — let's go
    const contentId = itemElements[0].getAttribute("data-item-id");
    if (!contentId) {
      throw new Error("data-item-id exists but is empty wtf");
    }

    debugLog("GofileDownloader", `Single file locked in: contentId = ${contentId}`);

    if (typeof unsafeWindow.downloadContent !== "function") {
      debugLog("GofileDownloader", "downloadContent is not a function — site updated?");

      alert("Can't find downloadContent — page probably changed.");
      await saveConfigKeys({ processingDownload: false });
      return;
    }

    debugLog("GofileDownloader", "Calling downloadContent()... hold tight");
    unsafeWindow.downloadContent(contentId);

    // Success path: reset flag + try auto-close
    setTimeout(async () => {
      await saveConfigKeys({ processingDownload: false });
      debugLog("GofileDownloader", "Download triggered — resetting processing flag");

      try {
        debugLog("GofileDownloader", "Trying to auto-close tab... bye bitch");
        window.close();
      } catch (e) {
        console.warn("Close blocked (normal if last tab or not script-opened)", e);
        // Cute fallback overlay
        const msg = document.createElement("div");
        msg.innerHTML = `
          <div>
            Download started! You can close this tab now 
          </div>
        `;
        const el = msg.firstElementChild;
        styleDownloadSuccess(el, { background: "#ec5555", color: "white" });
        document.body.appendChild(el);
      }
    }, AUTO_CLOSE_DELAY);
  } catch (err) {
    debugLog("GofileDownloader", `Crashed hard: ${err.message}`);
    alert("Downloader died: " + err.message);
    await saveConfigKeys({ processingDownload: false }); // always reset on error
  }
}
