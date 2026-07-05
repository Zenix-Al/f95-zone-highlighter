import {
  AUTOMATION_MARKER_KEY,
  DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY,
  DIRECT_DOWNLOAD_ROUTE_TS_KEY,
  TIMINGS,
  SELECTORS,
} from "../constants.js";
import { queryAllBySelectors, sleep } from "../utils.js";
import {
  getElementText,
  getAnchorHref,
  isElementDisabled,
  isElementVisible,
  waitForCandidate,
} from "./shared/dom.js";

const HOST_LABEL = "workupload.com";

function isWorkuploadFilePage() {
  return (
    location.hostname.toLowerCase().includes(HOST_LABEL) &&
    location.pathname.startsWith("/file/")
  );
}

function isWorkuploadStartPage() {
  return (
    location.hostname.toLowerCase().includes(HOST_LABEL) &&
    location.pathname.startsWith("/start/")
  );
}

function getWorkuploadDownloadHref(anchor) {
  return getAnchorHref(anchor, location.href);
}

function isWorkuploadDownloadAnchor(anchor) {
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  if (
    !anchor.isConnected ||
    isElementDisabled(anchor) ||
    !isElementVisible(anchor)
  )
    return false;
  const href = getWorkuploadDownloadHref(anchor);
  if (!href) return false;
  try {
    const parsed = new URL(href);
    if (!parsed.hostname.toLowerCase().includes(HOST_LABEL)) return false;
    if (!parsed.pathname.startsWith("/start/")) return false;
  } catch {
    return false;
  }
  const text = getElementText(anchor);
  return !text || text.includes("download");
}

function findWorkuploadDownloadAnchor() {
  const anchors = queryAllBySelectors(
    SELECTORS.WORKUPLOAD.DOWNLOAD_BUTTON_CANDIDATES,
  );
  return anchors.find(isWorkuploadDownloadAnchor) || null;
}

async function waitForWorkuploadDownloadAnchor(
  timeoutMs = TIMINGS.WORKUPLOAD_DOWNLOAD_BUTTON_WAIT_TIMEOUT,
) {
  return waitForCandidate({
    timeoutMs,
    intervalMs: Math.max(250, TIMINGS.POLL_INTERVAL),
    getCandidate: findWorkuploadDownloadAnchor,
  });
}

function preserveAutomationMarkers(startHref) {
  try {
    const current = new URL(location.href);
    const target = new URL(startHref, location.href);
    for (const key of [
      AUTOMATION_MARKER_KEY,
      DIRECT_DOWNLOAD_ROUTE_TS_KEY,
      DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY,
      "f95ue_tab",
    ]) {
      const value = current.searchParams.get(key);
      if (value && !target.searchParams.get(key)) {
        target.searchParams.set(key, value);
      }
    }
    return target.href;
  } catch {
    return startHref;
  }
}

export async function processWorkuploadDownload({
  showToast,
  notifyMainFailure,
  reportAddonHealthy,
}) {
  if (isWorkuploadStartPage()) {
    if (TIMINGS.WORKUPLOAD_DOWNLOAD_START_SETTLE_DELAY > 0) {
      await sleep(TIMINGS.WORKUPLOAD_DOWNLOAD_START_SETTLE_DELAY);
    }
    showToast("Workupload download triggered.");
    reportAddonHealthy();
    return;
  }

  if (!isWorkuploadFilePage()) {
    await notifyMainFailure(HOST_LABEL, "Unsupported Workupload page.");
    return;
  }

  const anchor = await waitForWorkuploadDownloadAnchor();
  if (!anchor) {
    await notifyMainFailure(HOST_LABEL, "Download button not found.");
    return;
  }

  const startHref = getWorkuploadDownloadHref(anchor);
  if (!startHref) {
    await notifyMainFailure(HOST_LABEL, "Download start link not found.");
    return;
  }

  showToast("Workupload download page opened.");
  location.assign(preserveAutomationMarkers(startHref));
}
