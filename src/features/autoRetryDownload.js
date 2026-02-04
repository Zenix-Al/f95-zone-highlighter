import { supportedDirectDownload } from "../config";
import { debugLog } from "../core/logger";

function autoRetryDownload(maxRetries = 99) {
  let retries = 0;
  let success = false;
  const originalUrl = location.href;

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
      if (success) debugLog("autoRetryDownload", `Download started after ${retries} retries`);
      else debugLog("autoRetryDownload", `Gave up after ${maxRetries} retries`);
      return;
    }

    retries++;
    debugLog("autoRetryDownload", `Attempt ${retries}/${maxRetries} — ${originalUrl}`);

    GM_xmlhttpRequest({
      method: "HEAD",
      url: originalUrl,
      timeout: 10000, // don't hang forever
      onload: (response) => {
        const status = response.status;
        debugLog("autoRetryDownload", `[HEAD] Status: ${status}`);

        if (status >= 200 && status < 300) {
          debugLog(
            "autoRetryDownload",
            `[HEAD] Server says OK — waiting for actual download trigger...`
          );
          // We don't stop here — we keep the observer alive until we see the real sign
        } else {
          debugLog(
            "autoRetryDownload",
            `[HEAD] Bad status ${status} — reloading page to retry download`
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
  }, 60000);
}
export function getMatchingDirectDownloadConfig() {
  return supportedDirectDownload.find(
    (conf) =>
      location.hostname.includes(conf.host) && location.pathname.startsWith(conf.pathStartsWith)
  );
}
export function executeAutoRetry(host) {
  if (host) {
    debugLog(
      "autoRetryDownload",
      `[${host} Auto-Retry] Activated! Let's keep that download pounding...`
    );
    autoRetryDownload(8, host);
  }
}
