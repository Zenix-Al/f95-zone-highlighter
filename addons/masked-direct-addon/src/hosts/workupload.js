import { TIMINGS, SELECTORS } from "./constants.js";
import {
  getElementText,
  getAnchorHref,
  isElementDisabled,
  isElementVisible,
} from "./shared/dom.js";
import { createHostAutomation } from "./shared/automation.js";
const HOST_LABEL = "workupload.com";
const WORKUPLOAD_FILE_PATH = /^\/file\/([a-z0-9_-]+)\/?$/i;
const WORKUPLOAD_START_PATH = /^\/start\/([a-z0-9_-]+)\/?$/i;

function getWorkuploadDownloadHref(anchor) {
  return getAnchorHref(anchor, location.href);
}

function isWorkuploadDownloadAnchor(anchor) {
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  if (!anchor.isConnected || isElementDisabled(anchor) || !isElementVisible(anchor)) return false;
  const href = getWorkuploadDownloadHref(anchor);
  if (!href) return false;
  try {
    const parsed = new URL(href);
    if (parsed.hostname.toLowerCase() !== HOST_LABEL || parsed.protocol !== "https:") return false;
    if (!WORKUPLOAD_START_PATH.test(parsed.pathname)) return false;
  } catch {
    return false;
  }
  const text = getElementText(anchor);
  return !text || text.includes("download");
}

export const processWorkuploadDownload = createHostAutomation({
  id: "workupload",
  canonicalHost: "workupload.com",
  hostIncludes: ["workupload.com"],
  text: "Workupload",
  tooltip: "Enable direct download automation for workupload.com",
  routes: [
    { path: WORKUPLOAD_FILE_PATH, entry: { identity: 1, nextStage: "workupload-start" } },
    {
      path: WORKUPLOAD_START_PATH,
      kind: "start",
      allow: false,
      continuation: { identity: 1, nextStage: "workupload-start" },
    },
  ],
  routeError: "Unsupported Workupload page.",
  actions: [
    {
      tool: "delay",
      whenRoute: "start",
      ms: TIMINGS.WORKUPLOAD_DOWNLOAD_START_SETTLE_DELAY,
    },
    { tool: "healthy", whenRoute: "start" },
    {
      tool: "navigate",
      selectors: SELECTORS.WORKUPLOAD.DOWNLOAD_BUTTON_CANDIDATES,
      validate: isWorkuploadDownloadAnchor,
      read: getWorkuploadDownloadHref,
      url: getWorkuploadDownloadHref,
      allowUrl: (url) =>
        url.protocol === "https:" &&
        url.hostname === HOST_LABEL &&
        WORKUPLOAD_START_PATH.test(url.pathname),
      timeoutMs: TIMINGS.WORKUPLOAD_DOWNLOAD_BUTTON_WAIT_TIMEOUT,
      errors: {
        missing: "Download button not found.",
        changed: "Download link changed before dispatch.",
      },
    },
  ],
});
