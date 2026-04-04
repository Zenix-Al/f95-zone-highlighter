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

function isDownloadLinkNode(node) {
  return (
    node.tagName === "A" &&
    (node.hasAttribute("download") ||
      node.href?.startsWith("blob:") ||
      node.href?.includes(".zip") ||
      node.href?.includes(".rar"))
  );
}

function isProgressSignalNode(node) {
  return (
    node.classList?.contains("progress") || node.textContent?.toLowerCase().includes("downloading")
  );
}

function createDownloadSignalObserver({ getAttempt, onSuccess }) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;

        if (isDownloadLinkNode(node)) {
          debugLog("autoRetryDownload", `Detected download link on attempt ${getAttempt() + 1}`);
          onSuccess();
          observer.disconnect();
          return;
        }

        if (isProgressSignalNode(node)) {
          debugLog("autoRetryDownload", `Detected progress UI on attempt ${getAttempt() + 1}`);
          onSuccess();
          observer.disconnect();
          return;
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}

function logProbeFailure(error) {
  const isAbort = error?.name === "AbortError" || /abort/i.test(String(error?.message || ""));
  debugLog(
    "autoRetryDownload",
    isAbort
      ? "[HEAD] Timeout - reloading page to retry download"
      : "[HEAD] Request error - reloading page to retry download",
  );
}

function shouldStopRetry({ success, retries, maxRetries }) {
  return success || retries >= maxRetries;
}

function finalizeRetry({ success, retries, maxRetries, observer, storageKey }) {
  observer.disconnect();

  if (success) {
    debugLog("autoRetryDownload", `Download started after ${retries} retries`);
    return;
  }

  debugLog("autoRetryDownload", `Gave up after ${maxRetries} retries`);
  sessionStorage.removeItem(storageKey);
}

function scheduleSafetyRetry({ getSuccess, getRetries, maxRetries }) {
  setTimeout(() => {
    if (!getSuccess() && getRetries() < maxRetries) {
      debugLog("autoRetryDownload", "Timeout waiting for download signal - forcing retry");
      location.reload();
    }
  }, TIMINGS.AUTO_RETRY_TIMEOUT);
}

function autoRetryDownload(maxRetries = 99) {
  const originalUrl = location.href;
  const storageKey = `autoRetryCount_${encodeURIComponent(originalUrl)}`;
  let retries = parseInt(sessionStorage.getItem(storageKey) || "0", 10);
  let success = false;

  const observer = createDownloadSignalObserver({
    getAttempt: () => retries,
    onSuccess: () => {
      success = true;
      sessionStorage.removeItem(storageKey);
    },
  });

  const tryLoad = async () => {
    if (shouldStopRetry({ success, retries, maxRetries })) {
      finalizeRetry({ success, retries, maxRetries, observer, storageKey });
      return;
    }

    retries++;
    sessionStorage.setItem(storageKey, retries);
    debugLog("autoRetryDownload", `Attempt ${retries}/${maxRetries} - ${originalUrl}`);

    const probe = await probeUrlWithTimeout(originalUrl, TIMINGS.DOWNLOAD_TIMEOUT);
    if (!probe.ok) {
      logProbeFailure(probe.error);
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

  scheduleSafetyRetry({
    getSuccess: () => success,
    getRetries: () => retries,
    maxRetries,
  });
}

export function executeAutoRetry(host) {
  if (host) {
    debugLog("autoRetryDownload", `[${host} Auto-Retry] Activated. Retrying download flow...`);
    autoRetryDownload(8);
  }
}
