import { config, downloadHostConfigs } from "../../config";
import { debugLog } from "../../core/logger";
import { saveConfigKeys } from "../../services/settingsService";

const hostHandlers = {
  "buzzheavier.com": handleBuzzshare,
  "gofile.io": handleGofile,
  // "pixeldrain.com": handlePixeldrain, // Example for future extensibility
};

// this file is for iframe download handlers or common handler
// if a site require normal user like behavior or complex interaction
// single site helper should be used instead to avoid bloating this file
export function handleDownload(host) {
  if (config.threadSettings.directDownloadLinks === false) return;

  const handler = hostHandlers[host];
  if (!handler) return;

  const exec = async () => {
    // Handlers are now self-sufficient and get their own config
    await handler();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", exec);
  } else {
    exec();
  }
}
async function handleBuzzshare() {
  if (window.top === window.self) return; // This handler should only run in an iframe
  const { btn: btnEl, directDownloadLink: dlLink } =
    downloadHostConfigs["buzzheavier.com"].handlerConfig;

  function failedDownload() {
    window.parent.postMessage(
      {
        op: "FAILED",
        src: window.location.href,
        dest: null,
      },
      "*",
    );
  }
  const btn = document.querySelector(btnEl);
  if (!btn) {
    failedDownload();
    return;
  }

  const endpoint = window.location.origin + btn.getAttribute("hx-get");

  try {
    const res = await fetch(endpoint, {
      headers: {
        "HX-Request": "true",
        "HX-Current-URL": window.location.href,
      },
    });

    const text = await res.text();
    const match = text.match(dlLink);
    const header = res.headers.get("HX-Redirect");

    let dest = match ? match[0] : header && header.includes("trashbytes.net") ? header : null;
    if (!dest && res.url.includes("trashbytes.net")) dest = res.url;

    if (dest) {
      window.parent.postMessage(
        {
          op: "DOWNLOAD_LINK_RESOLVED",
          src: window.location.href,
          dest: dest.replace(/&amp;/g, "&"),
        },
        "*",
      );
    }
    if (document.body.innerText.includes("This file could not be found.")) {
      failedDownload();
      return;
    }
  } catch (e) {
    console.error("[BH-Resolver] Fetch failed", e);
  }
}

async function handleGofile() {
  // This logic is adapted from the original `processGofileDownload` function.
  if (!config.threadSettings.directDownloadLinks || !config.processingDownload) return;

  const AUTO_CLOSE_DELAY = 6000;

  const waitForContentReady = (timeout = 20000) => {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const loading = document.querySelector("#filemanager_loading");
        const itemsList = document.querySelector("#filemanager_itemslist");
        const isReady =
          (!loading || getComputedStyle(loading).display === "none") &&
          itemsList &&
          itemsList.children.length > 0;
        if (isReady) {
          debugLog("GofileDownloader", "Content ready.");
          resolve(true);
          return;
        }
        if (Date.now() - start > timeout) {
          reject(new Error("Timeout waiting for Gofile content to render."));
          return;
        }
        setTimeout(check, 400);
      };
      check();
    });
  };

  try {
    debugLog("GofileDownloader", "Starting Gofile auto-download process...");
    await waitForContentReady();
    await new Promise((r) => setTimeout(r, 600));

    const alertEl = document.querySelector("#filemanager_alert");
    if (alertEl && getComputedStyle(alertEl).display !== "none") {
      debugLog("GofileDownloader", "Alert visible, file may be removed.");
      alert("Gofile: This file has been removed or is restricted.");
      await saveConfigKeys({ processingDownload: false });
      return;
    }

    const itemsList = document.querySelector("#filemanager_itemslist");
    if (!itemsList) {
      throw new Error("Could not find #filemanager_itemslist on Gofile page.");
    }

    const itemElements = itemsList.querySelectorAll("[data-item-id]");
    if (itemElements.length === 0) {
      debugLog("GofileDownloader", "No downloadable items found.");
      await saveConfigKeys({ processingDownload: false });
      return;
    }

    if (itemElements.length > 1) {
      debugLog("GofileDownloader", "Multiple files detected, skipping auto-download.");
      alert("Gofile: Multiple files detected. Please download manually.");
      await saveConfigKeys({ processingDownload: false });
      return;
    }

    const contentId = itemElements[0].getAttribute("data-item-id");
    if (!contentId) {
      throw new Error("Gofile item found but it has no contentId.");
    }

    if (typeof unsafeWindow.downloadContent !== "function") {
      debugLog("GofileDownloader", "unsafeWindow.downloadContent is not a function.");
      alert("Gofile: The site's download function has changed. Cannot auto-download.");
      await saveConfigKeys({ processingDownload: false });
      return;
    }

    debugLog("GofileDownloader", `Calling downloadContent() for id: ${contentId}`);
    unsafeWindow.downloadContent(contentId);

    setTimeout(async () => {
      await saveConfigKeys({ processingDownload: false });
      debugLog("GofileDownloader", "Download triggered, resetting flag.");
      try {
        debugLog("GofileDownloader", "Attempting to auto-close tab.");
        window.close();
      } catch (e) {
        // This is expected to fail sometimes.
      }
    }, AUTO_CLOSE_DELAY);
  } catch (err) {
    debugLog("GofileDownloader", `Crashed: ${err.message}`);
    alert("Gofile Downloader Error: " + err.message);
    await saveConfigKeys({ processingDownload: false });
  }
}
