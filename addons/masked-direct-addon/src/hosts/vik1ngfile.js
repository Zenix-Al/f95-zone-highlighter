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
const VIKING_ENTRY_HOST = "vikingfile.com";
const VIKING_CONTINUATION_HOST = "vik1ngfile.site";
const VIKING_FILE_PATH = /^\/f\/([a-z0-9_-]{5,64})\/?$/i;
const DOWNLOAD_BUTTON_CANDIDATES = [
  "a[href]",
  "button",
  'input[type="button"]',
  ".btn",
];

export function classifyVikingStandaloneEntry(url = location.href) {
  return (
    classifyVikingRoute(url, VIKING_ENTRY_HOST, "vik1ngfile-page") ||
    classifyVikingRoute(url, VIKING_CONTINUATION_HOST, "vik1ngfile-page")
  );
}

export function classifyVikingStandaloneContinuation(url = location.href) {
  return classifyVikingRoute(url, VIKING_CONTINUATION_HOST, "vik1ngfile-page");
}

function classifyVikingRoute(url, hostname, nextStage) {
  try {
    const parsed = new URL(url, `https://${hostname}/`);
    const match = parsed.pathname.match(VIKING_FILE_PATH);
    return parsed.hostname === hostname && match
      ? { identity: match[1], nextStage }
      : null;
  } catch {
    return null;
  }
}

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
  automationDecision,
  stepDelayMs = 1200,
}) {
  let firstClickDone = false;
  const stepCount = automationDecision?.mode === "standalone" ? 1 : 2;

  for (let step = 0; step < stepCount; step += 1) {
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
    await sleep(Math.max(0, Number(stepDelayMs) || 0));
  }

  if (
    automationDecision?.mode === "standalone" &&
    automationDecision.standaloneEntry
  ) return;
  reportAddonHealthy();
}
