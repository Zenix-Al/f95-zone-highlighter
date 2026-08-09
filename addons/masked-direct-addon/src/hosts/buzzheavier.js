import { SELECTORS, TIMINGS } from "../constants.js";
import { queryFirstBySelectors } from "../shared/utils.js";
import {
  clickElement,
  getElementAttributeUrl,
  waitForCandidate,
} from "./shared/dom.js";
import { matchesDirectDownloadHostPath } from "./shared/filePage.js";

const BUZZHEAVIER_FILE_PATH = /^\/[a-z0-9_-]{8,64}\/?$/i;

export function isBuzzheavierFilePage(url = location.href) {
  return matchesDirectDownloadHostPath(url, {
    hostId: "buzzheavier",
    pathPattern: BUZZHEAVIER_FILE_PATH,
    baseUrl: "https://buzzheavier.com/",
  });
}

function toDownloadEndpoint(button) {
  if (!(button instanceof HTMLAnchorElement)) return "";
  return getElementAttributeUrl(
    button,
    ["hx-get", "data-hx-get", "href"],
    window.location.origin,
  );
}

export async function processBuzzheavierDownload({
  challengeGate,
  notifyMainFailure,
  reportAddonHealthy,
  buttonWaitTimeoutMs = TIMINGS.BUZZHEAVIER_DOWNLOAD_BUTTON_WAIT_TIMEOUT,
  pollIntervalMs = TIMINGS.POLL_INTERVAL,
}) {
  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  const hostLabel = location.hostname.includes("bzzhr.to")
    ? "bzzhr.to"
    : "buzzheavier.com";
  const button = await waitForCandidate({
    getCandidate: () =>
      queryFirstBySelectors(
        SELECTORS.BUZZHEAVIER.DOWNLOAD_BUTTON_CANDIDATES,
      ),
    timeoutMs: buttonWaitTimeoutMs,
    intervalMs: pollIntervalMs,
  });
  if (!(button instanceof HTMLAnchorElement)) {
    await notifyMainFailure(hostLabel, "Download button not found.");
    return;
  }
  const endpoint = toDownloadEndpoint(button);
  let validEndpoint = false;
  try {
    const parsed = new URL(endpoint);
    validEndpoint =
      parsed.origin === window.location.origin &&
      parsed.pathname.endsWith("/download");
  } catch {
    validEndpoint = false;
  }
  if (!validEndpoint) {
    await notifyMainFailure(hostLabel, "Download endpoint not found.");
    return;
  }
  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  if (!clickElement(button)) {
    await notifyMainFailure(hostLabel, "Unable to trigger download button.");
    return;
  }
  reportAddonHealthy();
}
