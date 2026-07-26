import { TIMINGS } from "../constants.js";
import { queryAllBySelectors, sleep } from "../shared/utils.js";
import {
  clickElement,
  getElementText,
  isElementDisabled,
  isElementVisible,
  waitForCandidate,
} from "./shared/dom.js";
import { classifyFilePageUrl } from "./shared/filePage.js";

const HOST_LABEL = "download.gg";
export const DOWNLOAD_GG_POST_CLICK_GRACE_MS = 8000;
const FILE_PATH_PATTERN =
  /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?file-[a-z0-9_-]+\/?$/i;
const DOWNLOAD_BUTTON_SELECTORS = [
  "button.downloadAttachment",
  'button.downloadAttachment[type="submit"]',
  'button.btn-file[type="submit"]',
  'form button.btn-pink[type="submit"]',
];

export function isDownloadGgFilePage(url = location.href) {
  return (
    classifyFilePageUrl(url, { pathPattern: FILE_PATH_PATTERN }) === "file"
  );
}

function isDownloadButton(button) {
  if (!(button instanceof HTMLButtonElement)) return false;
  if (isElementDisabled(button) || !isElementVisible(button)) return false;
  const text = getElementText(button);
  return (
    button.classList.contains("downloadAttachment") ||
    text.includes("download") ||
    Boolean(button.querySelector(".fa-download, .fas.fa-download"))
  );
}

function findDownloadButton() {
  return (
    queryAllBySelectors(DOWNLOAD_BUTTON_SELECTORS).find(isDownloadButton) ||
    null
  );
}

export async function processDownloadGg({
  challengeGate,
  notifyMainFailure,
  reportAddonHealthy,
  postClickGraceMs = DOWNLOAD_GG_POST_CLICK_GRACE_MS,
}) {
  if (!isDownloadGgFilePage()) {
    await notifyMainFailure(HOST_LABEL, "Unsupported download.gg page.");
    return;
  }

  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  const button = await waitForCandidate({
    timeoutMs: 20000,
    intervalMs: Math.max(250, TIMINGS.POLL_INTERVAL),
    getCandidate: findDownloadButton,
  });
  if (!button) {
    await notifyMainFailure(HOST_LABEL, "Download button not found.");
    return;
  }

  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  if (!clickElement(button)) {
    await notifyMainFailure(HOST_LABEL, "Unable to trigger download button.");
    return;
  }
  await sleep(Math.max(0, Number(postClickGraceMs) || 0));
  reportAddonHealthy();
}
