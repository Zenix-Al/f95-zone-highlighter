import { TIMINGS } from "../constants.js";
import { queryAllBySelectors, sleep } from "../shared/utils.js";
import {
  clickElement,
  getElementText,
  isCountdownText,
  isElementDisabled,
  isElementVisible,
} from "./shared/dom.js";

const HOST_LABEL = "vik1ngfile.site";
const DOWNLOAD_BUTTON_CANDIDATES = [
  "a[href]",
  "button",
  'input[type="button"]',
  ".btn",
];

function isVik1ngDownloadButton(element) {
  const text = getElementText(element);
  if (!text || !text.includes("download")) return false;
  if (
    text.includes("generat") ||
    text.includes("prepar") ||
    text.includes("wait") ||
    isCountdownText(text)
  ) {
    return false;
  }
  return isElementVisible(element) && !isElementDisabled(element);
}

function findVik1ngDownloadButton() {
  const candidates = queryAllBySelectors(DOWNLOAD_BUTTON_CANDIDATES);
  return candidates.find(isVik1ngDownloadButton) || null;
}

async function waitForVik1ngDownloadButton(timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const button = findVik1ngDownloadButton();
    if (button) return button;
    await sleep(Math.max(250, TIMINGS.POLL_INTERVAL));
  }
  return null;
}

export async function processVik1ngfileDownload({
  challengeGate,
  notifyMainFailure,
  reportAddonHealthy,
}) {
  let firstClickDone = false;

  for (let step = 0; step < 2; step += 1) {
    if (challengeGate && !(await challengeGate.waitUntilClear())) return;
    const button = await waitForVik1ngDownloadButton(
      firstClickDone ? 30000 : 20000,
    );
    if (!button) {
      await notifyMainFailure(
        HOST_LABEL,
        firstClickDone
          ? "Final download button not found."
          : "Download button not found.",
      );
      return;
    }

    if (challengeGate && !(await challengeGate.waitUntilClear())) return;
    if (!clickElement(button)) {
      await notifyMainFailure(HOST_LABEL, "Unable to trigger download button.");
      return;
    }
    firstClickDone = true;
    await sleep(1200);
  }

  reportAddonHealthy();
}
