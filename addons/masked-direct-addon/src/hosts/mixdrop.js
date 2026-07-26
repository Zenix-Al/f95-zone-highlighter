import { TIMINGS } from "../constants.js";
import { queryAllBySelectors, sleep } from "../shared/utils.js";
import {
  clickElement,
  getAnchorHref,
  getElementText,
  isElementDisabled,
  isElementVisible,
  waitForCandidate,
} from "./shared/dom.js";
import { classifyFilePageUrl } from "./shared/filePage.js";

const HOST_LABEL = "MixDrop";
const FILE_PATH_PATTERN = /^\/f\/[^/]+\/?$/i;
export const MIXDROP_POST_CLICK_GRACE_MS = 10000;
const DOWNLOAD_BUTTON_SELECTORS = [
  "a.download-btn",
  "a.btn.btn3.download-btn",
];

export function isMixdropFilePage(url = location.href) {
  return (
    classifyFilePageUrl(url, { pathPattern: FILE_PATH_PATTERN }) === "file"
  );
}

function isMixdropButton(anchor) {
  return (
    anchor instanceof HTMLAnchorElement &&
    isElementVisible(anchor) &&
    !isElementDisabled(anchor) &&
    getElementText(anchor).includes("download")
  );
}

function hasUsableDownloadHref(anchor) {
  const href = getAnchorHref(anchor);
  if (!href) return false;
  try {
    const protocol = new URL(href).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function findMixdropButton({ requireHref = false } = {}) {
  return (
    queryAllBySelectors(DOWNLOAD_BUTTON_SELECTORS).find(
      (anchor) =>
        isMixdropButton(anchor) &&
        (!requireHref || hasUsableDownloadHref(anchor)),
    ) || null
  );
}

export async function processMixdropDownload({
  challengeGate,
  notifyMainFailure,
  reportAddonHealthy,
  secondStageDelayMs = 5000,
  postClickGraceMs = MIXDROP_POST_CLICK_GRACE_MS,
}) {
  if (!isMixdropFilePage()) {
    await notifyMainFailure(HOST_LABEL, "Unsupported MixDrop page.");
    return;
  }

  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  const initial = await waitForCandidate({
    timeoutMs: 30000,
    intervalMs: Math.max(250, TIMINGS.POLL_INTERVAL),
    getCandidate: findMixdropButton,
  });
  if (!initial) {
    await notifyMainFailure(HOST_LABEL, "Initial download button not found.");
    return;
  }

  if (!hasUsableDownloadHref(initial)) {
    if (challengeGate && !(await challengeGate.waitUntilClear())) return;
    if (!clickElement(initial)) {
      await notifyMainFailure(
        HOST_LABEL,
        "Unable to trigger initial download button.",
      );
      return;
    }
  }

  await sleep(Math.max(0, Number(secondStageDelayMs) || 0));
  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  const finalLink = await waitForCandidate({
    timeoutMs: 60000,
    intervalMs: Math.max(250, TIMINGS.POLL_INTERVAL),
    getCandidate: () => findMixdropButton({ requireHref: true }),
  });
  if (!finalLink) {
    await notifyMainFailure(HOST_LABEL, "Final download link not found.");
    return;
  }

  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  finalLink.target = "_self";
  finalLink.removeAttribute("rel");
  if (!clickElement(finalLink)) {
    await notifyMainFailure(HOST_LABEL, "Unable to trigger final download link.");
    return;
  }
  await sleep(Math.max(0, Number(postClickGraceMs) || 0));
  reportAddonHealthy();
}
