import { state, downloadHostConfigs } from "../config";
import { debugLog } from "./logger";

export function waitFor(conditionFn, interval = 50, timeout = 2000) {
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
    state.isF95Zone = true;
  }
  if (path.startsWith("/threads")) {
    state.isThread = true;
  } else if (path.startsWith("/sam/latest_alpha")) {
    state.isLatest = true;
  } else if (path.startsWith("/masked")) {
    state.isMaskedLink = true;
  } else if (
    (location.hostname.includes("google.com") || location.hostname.includes("recaptcha.net")) &&
    path.startsWith("/recaptcha/")
  ) {
    // Check if we are inside a reCaptcha iframe
    state.isRecaptchaFrame = true;
  } else {
    const currentHost = location.hostname;
    const currentPath = location.pathname;

    for (const host in downloadHostConfigs) {
      if (currentHost.includes(host)) {
        const config = downloadHostConfigs[host];
        if (config.pageHandler) {
          state.isDownloadPage = config.pageHandler; // e.g., "gofile.io"
        }
        if (config.pageType === "auto-retry" && currentPath.startsWith(config.pathStartsWith)) {
          state.isDirectDownloadPage = true;
        }
      }
    }
  }
  debugLog(
    "PageDetect",
    `isF95Zone: ${state.isF95Zone}, isThread: ${state.isThread}, isLatest: ${state.isLatest}, isMaskedLink: ${state.isMaskedLink}, isDownloadPage: ${state.isDownloadPage}, isDirectDownloadPage: ${state.isDirectDownloadPage}, isRecaptchaFrame: ${state.isRecaptchaFrame}`,
  );
}
export function waitForBody(callback) {
  if (document.body) {
    callback();
  } else {
    requestAnimationFrame(() => waitForBody(callback));
  }
}
