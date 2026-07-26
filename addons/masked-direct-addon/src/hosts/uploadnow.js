import { sleep } from "../shared/utils.js";
import {
  clickElement,
  isElementDisabled,
  isElementVisible,
} from "./shared/dom.js";
import { classifyFilePageUrl } from "./shared/filePage.js";

const HOST_LABEL = "uploadnow.io";
const SHARE_PATH_PATTERN = /^\/[^/]+\/share\/?$/i;
const DOWNLOAD_ICON_SELECTOR = 'svg[data-icon="arrow-down-to-line"]';

export function isUploadNowSharePage(url = location.href) {
  return (
    classifyFilePageUrl(url, { pathPattern: SHARE_PATH_PATTERN }) === "file"
  );
}

function findDownloadButtons() {
  const preferred = Array.from(
    document.querySelectorAll('button[class*="file_browser_alt_options__"]'),
  );
  const candidates =
    preferred.length > 0
      ? preferred
      : Array.from(document.querySelectorAll("button"));
  return [...new Set(candidates)].filter(
    (button) =>
      button instanceof HTMLButtonElement &&
      button.querySelector(DOWNLOAD_ICON_SELECTOR) &&
      !isElementDisabled(button) &&
      isElementVisible(button),
  );
}

async function waitForStableDownloadButtons({
  challengeGate,
  timeoutMs,
  intervalMs,
  stableChecksRequired,
}) {
  const startedAt = Date.now();
  let previousCount = -1;
  let stableChecks = 0;
  let buttons = [];

  while (Date.now() - startedAt < timeoutMs) {
    if (challengeGate?.isBlocked?.()) {
      if (!(await challengeGate.waitUntilClear())) return [];
      previousCount = -1;
      stableChecks = 0;
    }

    buttons = findDownloadButtons();
    if (buttons.length > 0 && buttons.length === previousCount) {
      stableChecks += 1;
      if (stableChecks >= stableChecksRequired) return buttons;
    } else {
      stableChecks = 0;
    }
    previousCount = buttons.length;
    await sleep(intervalMs);
  }
  return buttons;
}

export async function processUploadNowDownload({
  challengeGate,
  notifyMainFailure,
  reportAddonHealthy,
  timeoutMs = 30000,
  intervalMs = 500,
  stableChecksRequired = 4,
}) {
  if (!isUploadNowSharePage()) {
    await notifyMainFailure(HOST_LABEL, "Unsupported UploadNow page.");
    return;
  }

  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  const buttons = await waitForStableDownloadButtons({
    challengeGate,
    timeoutMs,
    intervalMs,
    stableChecksRequired,
  });
  if (buttons.length === 0) {
    await notifyMainFailure(HOST_LABEL, "No download buttons were found.");
    return;
  }
  if (buttons.length !== 1) {
    await notifyMainFailure(
      HOST_LABEL,
      `Automatic download requires exactly one file; found ${buttons.length}.`,
    );
    return;
  }

  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  const button = buttons[0];
  button.scrollIntoView?.({ block: "center", behavior: "instant" });
  button.focus?.({ preventScroll: true });
  if (!clickElement(button)) {
    await notifyMainFailure(HOST_LABEL, "Unable to trigger the download.");
    return;
  }
  reportAddonHealthy();
}
