import stateManager, { downloadHostConfigs } from "../config.js";
import { debugLog } from "./logger.js";
import TIMINGS from "../config/timings.js";

export function waitFor(
  conditionFn,
  interval = TIMINGS.TILE_POPULATE_CHECK_INTERVAL,
  timeout = TIMINGS.TILE_POPULATE_TIMEOUT,
) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      if (conditionFn()) {
        resolve(true);
      } else if (Date.now() - start > timeout) {
        reject(new Error("Timeout waiting for condition"));
      } else {
        setTimeout(check, interval);
      }
    };

    check();
  });
}
export function detectPage() {
  const path = location.pathname;
  if (window.location.hostname.includes("f95zone.to")) {
    stateManager.set("isF95Zone", true);
  }
  if (path.startsWith("/threads")) {
    stateManager.set("isThread", true);
  } else if (path.startsWith("/sam/latest_alpha")) {
    stateManager.set("isLatest", true);
  } else if (path.startsWith("/masked")) {
    stateManager.set("isMaskedLink", true);
  } else if (
    (location.hostname.includes("google.com") || location.hostname.includes("recaptcha.net")) &&
    path.startsWith("/recaptcha/")
  ) {
    // Check if we are inside a reCaptcha iframe
    stateManager.set("isRecaptchaFrame", true);
  } else {
    const currentHost = location.hostname;
    const currentPath = location.pathname;

    for (const host in downloadHostConfigs) {
      if (currentHost.includes(host)) {
        const config = downloadHostConfigs[host];
        if (config.pageHandler) {
          stateManager.set("isDownloadPage", config.pageHandler); // e.g., "gofile.io"
        }
        if (config.pageType === "auto-retry" && currentPath.startsWith(config.pathStartsWith)) {
          stateManager.set("isDirectDownloadPage", true);
        }
      }
    }
  }
  debugLog(
    "PageDetect",
    `isF95Zone: ${stateManager.get("isF95Zone")}, isThread: ${stateManager.get("isThread")}, isLatest: ${stateManager.get("isLatest")}, isMaskedLink: ${stateManager.get("isMaskedLink")}, isDownloadPage: ${stateManager.get("isDownloadPage")}, isDirectDownloadPage: ${stateManager.get("isDirectDownloadPage")}, isRecaptchaFrame: ${stateManager.get("isRecaptchaFrame")}`,
  );
}
export function waitForBody(callback) {
  if (document.body) {
    callback();
  } else {
    requestAnimationFrame(() => waitForBody(callback));
  }
}
