import { state, supportedHosts } from "../constants";
import { getMatchingDirectDownloadConfig } from "../features/autoRetryDownload";
import { debugLog } from "./debugOutput";

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
  } else {
    state.isDownloadPage = supportedHosts.find((host) => location.hostname.includes(host));
    state.isDirectDownloadPage = getMatchingDirectDownloadConfig() !== undefined;
  }
  debugLog(
    "PageDetect",
    `isF95Zone: ${state.isF95Zone}, isThread: ${state.isThread}, isLatest: ${state.isLatest}, isMaskedLink: ${state.isMaskedLink}, isDownloadPage: ${state.isDownloadPage}, isDirectDownloadPage: ${state.isDirectDownloadPage}`
  );
}
export function waitForBody(callback) {
  if (document.body) {
    callback();
  } else {
    requestAnimationFrame(() => waitForBody(callback));
  }
}
