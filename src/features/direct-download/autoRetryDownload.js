import { debugLog } from "../../core/logger";
import TIMINGS from "../../config/timings.js";

async function probeUrlWithTimeout(url, timeout = TIMINGS.DOWNLOAD_TIMEOUT) {
  const supportsAbort = typeof AbortController === "function";
  const controller = supportsAbort ? new AbortController() : null;
  const timeoutId = setTimeout(() => {
    if (controller) controller.abort();
  }, timeout);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      credentials: "include",
      signal: controller?.signal,
    });
    return { ok: true, status: response.status };
  } catch (error) {
    return { ok: false, error };
  } finally {
    clearTimeout(timeoutId);
  }
}

function autoRetryDownload(maxRetries = 99) {
  const originalUrl = location.href;
  const storageKey = `autoRetryCount_${encodeURIComponent(originalUrl)}`;
  let retries = parseInt(sessionStorage.getItem(storageKey) || "0", 10);
  let success = false;

  // Observer detects when download likely started.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;

        // Trashbytes often adds a link or changes UI when download starts.
        if (
          node.tagName === "A" &&
          (node.hasAttribute("download") ||
            node.href?.startsWith("blob:") ||
            node.href?.includes(".zip") ||
            node.href?.includes(".rar"))
        ) {
          debugLog("autoRetryDownload", `Detected download link on attempt ${retries + 1}`);
          success = true;
          sessionStorage.removeItem(storageKey);
          observer.disconnect();
          return;
        }

        // Fallback signal: progress UI or downloading text.
        if (
          node.classList?.contains("progress") ||
          node.textContent?.toLowerCase().includes("downloading")
        ) {
          debugLog("autoRetryDownload", `Detected progress UI on attempt ${retries + 1}`);
          success = true;
          sessionStorage.removeItem(storageKey);
          observer.disconnect();
          return;
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  const tryLoad = async () => {
    if (success || retries >= maxRetries) {
      observer.disconnect();
      if (success) {
        debugLog("autoRetryDownload", `Download started after ${retries} retries`);
      } else {
        debugLog("autoRetryDownload", `Gave up after ${maxRetries} retries`);
        sessionStorage.removeItem(storageKey);
      }
      return;
    }

    retries++;
    sessionStorage.setItem(storageKey, retries);
    debugLog("autoRetryDownload", `Attempt ${retries}/${maxRetries} - ${originalUrl}`);

    const probe = await probeUrlWithTimeout(originalUrl, TIMINGS.DOWNLOAD_TIMEOUT);
    if (!probe.ok) {
      const isAbort =
        probe.error?.name === "AbortError" || /abort/i.test(String(probe.error?.message || ""));
      debugLog(
        "autoRetryDownload",
        isAbort
          ? "[HEAD] Timeout - reloading page to retry download"
          : "[HEAD] Request error - reloading page to retry download",
      );
      location.reload();
      return;
    }

    const status = probe.status;
    debugLog("autoRetryDownload", `[HEAD] Status: ${status}`);

    if (status >= 200 && status < 300) {
      debugLog(
        "autoRetryDownload",
        "[HEAD] Server says OK - waiting for actual download trigger...",
      );
      // Keep observer alive until we see a real download signal.
      return;
    }

    debugLog("autoRetryDownload", `[HEAD] Bad status ${status} - reloading page to retry download`);
    location.reload();
  };

  void tryLoad();

  // Safety net: if no success after timeout, force retry.
  setTimeout(() => {
    if (!success && retries < maxRetries) {
      debugLog("autoRetryDownload", "Timeout waiting for download signal - forcing retry");
      location.reload();
    }
  }, TIMINGS.AUTO_RETRY_TIMEOUT);
}

export function executeAutoRetry(host) {
  if (host) {
    debugLog("autoRetryDownload", `[${host} Auto-Retry] Activated. Retrying download flow...`);
    autoRetryDownload(8, host);
  }
}
