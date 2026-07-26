import { TIMINGS } from "../constants.js";
import { sleep } from "../shared/utils.js";
import {
  clickElement,
  isElementDisabled,
  isElementVisible,
  waitForCandidate,
} from "./shared/dom.js";
import { classifyFilePageUrl } from "./shared/filePage.js";

const HOST_LABEL = "uploadhaven.com";
const DOWNLOAD_PATH_PATTERN = /^\/download\/[^/]+\/?$/i;
const RECENT_RUN_TTL_MS = 30000;
export const UPLOADHAVEN_POST_CLICK_GRACE_MS = 10000;

export function isUploadHavenDownloadPage(url = location.href) {
  return (
    classifyFilePageUrl(url, { pathPattern: DOWNLOAD_PATH_PATTERN }) === "file"
  );
}

function findReadyFreeDownloadButton() {
  const button = document.querySelector("button#submitFree.uh-dl-btn-free.ready");
  if (!(button instanceof HTMLButtonElement)) return null;
  if (isElementDisabled(button) || !isElementVisible(button)) return null;
  return button;
}

function getRecentRunKey() {
  return `f95ue-uploadhaven-download:${location.pathname}`;
}

function wasTriggeredRecently() {
  try {
    const triggeredAt = Number(sessionStorage.getItem(getRecentRunKey()) || 0);
    return (
      Number.isFinite(triggeredAt) &&
      triggeredAt > 0 &&
      Date.now() - triggeredAt < RECENT_RUN_TTL_MS
    );
  } catch {
    return false;
  }
}

function markTriggered() {
  try {
    sessionStorage.setItem(getRecentRunKey(), String(Date.now()));
  } catch {
    // Request persistence still owns cross-page correlation.
  }
}

export async function processUploadHavenDownload({
  challengeGate,
  notifyMainFailure,
  reportAddonHealthy,
  initialWaitMs = 20000,
  postClickGraceMs = UPLOADHAVEN_POST_CLICK_GRACE_MS,
}) {
  if (!isUploadHavenDownloadPage()) {
    await notifyMainFailure(HOST_LABEL, "Unsupported UploadHaven page.");
    return;
  }

  if (wasTriggeredRecently()) {
    reportAddonHealthy();
    return;
  }

  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  await sleep(Math.max(0, Number(initialWaitMs) || 0));
  if (challengeGate && !(await challengeGate.waitUntilClear())) return;

  const button = await waitForCandidate({
    timeoutMs: 60000,
    intervalMs: Math.max(250, TIMINGS.POLL_INTERVAL),
    getCandidate: findReadyFreeDownloadButton,
  });
  if (!button) {
    await notifyMainFailure(
      HOST_LABEL,
      "Free Download button did not become ready.",
    );
    return;
  }

  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  button.scrollIntoView?.({ block: "center", behavior: "instant" });
  button.focus?.({ preventScroll: true });
  markTriggered();
  if (!clickElement(button)) {
    await notifyMainFailure(
      HOST_LABEL,
      "Unable to trigger the Free Download button.",
    );
    return;
  }

  // UploadHaven starts its download asynchronously after the click.
  await sleep(Math.max(0, Number(postClickGraceMs) || 0));
  reportAddonHealthy();
}
