import { TIMINGS, SELECTORS } from "../constants.js";
import { queryAllBySelectors, sleep } from "../shared/utils.js";
import {
  getElementText,
  getAnchorHref,
  isElementDisabled,
  isElementVisible,
  waitForCandidate,
} from "./shared/dom.js";
import { preserveManagedRouteMarkers } from "./shared/managedNavigation.js";
import { matchesDirectDownloadHostPath } from "./shared/filePage.js";

const HOST_LABEL = "workupload.com";
const WORKUPLOAD_FILE_PATH = /^\/file\/[a-z0-9_-]+\/?$/i;
const WORKUPLOAD_START_PATH = /^\/start\/[a-z0-9_-]+\/?$/i;

export function isWorkuploadFilePage(url = location.href) {
  return matchesDirectDownloadHostPath(url, {
    hostId: "workupload",
    pathPattern: WORKUPLOAD_FILE_PATH,
    baseUrl: "https://workupload.com/",
  });
}

export function isWorkuploadStartPage(url = location.href) {
  return matchesDirectDownloadHostPath(url, {
    hostId: "workupload",
    pathPattern: WORKUPLOAD_START_PATH,
    baseUrl: "https://workupload.com/",
  });
}

export function getWorkuploadStandaloneEntry(url = location.href) {
  return getWorkuploadRouteIdentity(url, WORKUPLOAD_FILE_PATH, "workupload-start");
}

export function getWorkuploadStandaloneContinuation(url = location.href) {
  return getWorkuploadRouteIdentity(url, WORKUPLOAD_START_PATH, "workupload-start");
}

function getWorkuploadRouteIdentity(url, pattern, nextStage) {
  try {
    const parsed = new URL(url, "https://workupload.com/");
    if (parsed.hostname !== HOST_LABEL || !pattern.test(parsed.pathname)) return null;
    return {
      identity: parsed.pathname.split("/").filter(Boolean).at(-1),
      nextStage,
    };
  } catch {
    return null;
  }
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

export async function processWorkuploadDownload({
  challengeGate,
  notifyMainFailure,
  reportAddonHealthy,
}) {
  if (isWorkuploadStartPage()) {
    if (TIMINGS.WORKUPLOAD_DOWNLOAD_START_SETTLE_DELAY > 0) {
      await sleep(TIMINGS.WORKUPLOAD_DOWNLOAD_START_SETTLE_DELAY);
    }
    if (challengeGate && !(await challengeGate.waitUntilClear())) return;
    reportAddonHealthy();
    return;
  }

  if (!isWorkuploadFilePage()) {
    await notifyMainFailure(HOST_LABEL, "Unsupported Workupload page.");
    return;
  }

  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
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

  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  location.assign(preserveManagedRouteMarkers(startHref));
}
