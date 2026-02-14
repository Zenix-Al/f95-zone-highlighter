import { debugLog } from "../../core/logger";
import TIMINGS from "../../config/timings.js";

function autoRetryDownload(maxRetries = 99) {
  const originalUrl = location.href;
  const storageKey = `autoRetryCount_${encodeURIComponent(originalUrl)}`;
  let retries = parseInt(sessionStorage.getItem(storageKey) || "0", 10);
  let success = false;

  // This is the KEY: observer that detects when download probably started
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue; // only elements

        // Trashbytes often adds a link or changes UI when download starts
        if (
          node.tagName === "A" &&
          (node.hasAttribute("download") ||
            node.href?.startsWith("blob:") ||
            node.href?.includes(".zip") ||
            node.href?.includes(".rar"))
        ) {
          debugLog("autoRetryDownload", `Detected download link on attempt ${retries + 1}`);
          success = true;
          sessionStorage.removeItem(storageKey); // Clean up on success
          observer.disconnect();
          return;
        }

        // Or look for progress bar / "Downloading..." text / specific class
        if (
          node.classList?.contains("progress") ||
          node.textContent?.toLowerCase().includes("downloading")
        ) {
          debugLog("autoRetryDownload", `Detected progress UI on attempt ${retries + 1}`);
          success = true;
          sessionStorage.removeItem(storageKey); // Clean up on success
          observer.disconnect();
          return;
        }
      }
    }
  });

  // Start watching right away
  observer.observe(document.body, { childList: true, subtree: true });

  const tryLoad = () => {
    if (success || retries >= maxRetries) {
      observer.disconnect();
      if (success) {
        debugLog("autoRetryDownload", `Download started after ${retries} retries`);
      } else {
        debugLog("autoRetryDownload", `Gave up after ${maxRetries} retries`);
        sessionStorage.removeItem(storageKey); // Clean up on failure
      }
      return;
    }

    retries++;
    sessionStorage.setItem(storageKey, retries);
    debugLog("autoRetryDownload", `Attempt ${retries}/${maxRetries} — ${originalUrl}`);

    GM_xmlhttpRequest({
      method: "HEAD",
      url: originalUrl,
      timeout: TIMINGS.DOWNLOAD_TIMEOUT, // don't hang forever
      onload: (response) => {
        const status = response.status;
        debugLog("autoRetryDownload", `[HEAD] Status: ${status}`);

        if (status >= 200 && status < 300) {
          debugLog(
            "autoRetryDownload",
            `[HEAD] Server says OK — waiting for actual download trigger...`,
          );
          // We don't stop here — we keep the observer alive until we see the real sign
        } else {
          debugLog(
            "autoRetryDownload",
            `[HEAD] Bad status ${status} — reloading page to retry download`,
          );
          location.reload();
        }
      },
      onerror: () => {
        debugLog("autoRetryDownload", "[HEAD] Request error — reloading page to retry download");
        location.reload();
      },
      ontimeout: () => {
        debugLog("autoRetryDownload", "[HEAD] Timeout — reloading page to retry download");
        location.reload();
      },
    });
  };

  // Kick it off
  tryLoad();

  // Optional: safety net — if no success after 60 seconds, retry anyway
  setTimeout(() => {
    if (!success && retries < maxRetries) {
      debugLog("autoRetryDownload", "Timeout waiting for download signal — forcing retry");
      location.reload();
    }
  }, TIMINGS.AUTO_RETRY_TIMEOUT);
}

export function executeAutoRetry(host) {
  if (host) {
    debugLog(
      "autoRetryDownload",
      `[${host} Auto-Retry] Activated! Let's keep that download pounding...`,
    );
    autoRetryDownload(8, host);
  }
}
