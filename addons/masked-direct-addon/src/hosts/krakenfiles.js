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

const HOST_LABEL = "krakenfiles.com";
const FILE_PATH_PATTERN = /^\/view\/[^/]+\/file\.html\/?$/i;
const DOWNLOAD_BUTTON_SELECTOR = "button[type='submit'].btn.btn-primary";

export function isKrakenFilesFilePage(url = location.href) {
  return (
    classifyFilePageUrl(url, { pathPattern: FILE_PATH_PATTERN }) === "file"
  );
}

function findDownloadButton() {
  return (
    queryAllBySelectors([DOWNLOAD_BUTTON_SELECTOR]).find(
      (button) =>
        button instanceof HTMLButtonElement &&
        !isElementDisabled(button) &&
        isElementVisible(button) &&
        getElementText(button).includes("download now"),
    ) || null
  );
}

export async function processKrakenFilesDownload({
  challengeGate,
  notifyMainFailure,
  reportAddonHealthy,
  postClickGraceMs = 3000,
}) {
  if (!isKrakenFilesFilePage()) {
    await notifyMainFailure(HOST_LABEL, "Unsupported KrakenFiles page.");
    return;
  }

  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  const button = await waitForCandidate({
    timeoutMs: 30000,
    intervalMs: Math.max(250, TIMINGS.POLL_INTERVAL),
    getCandidate: findDownloadButton,
  });
  if (!button) {
    await notifyMainFailure(HOST_LABEL, "Download now button not found.");
    return;
  }

  // A challenge may appear while KrakenFiles prepares the control.
  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  button.scrollIntoView?.({ block: "center", behavior: "instant" });
  button.focus?.({ preventScroll: true });
  if (!clickElement(button)) {
    await notifyMainFailure(
      HOST_LABEL,
      "Unable to trigger the Download now button.",
    );
    return;
  }

  // KrakenFiles enters a short loading state before starting the download.
  await sleep(Math.max(0, Number(postClickGraceMs) || 0));
  reportAddonHealthy();
}
