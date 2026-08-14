import { SELECTORS, TIMINGS } from "../constants.js";
import { queryFirstBySelectors } from "../shared/utils.js";
import { clickElement, getAnchorHref, waitForCandidate } from "./shared/dom.js";
import { matchesDirectDownloadHostPath } from "./shared/filePage.js";

const MEDIAFIRE_FILE_PATH =
  /^\/(?:file|file_premium)\/[a-z0-9]{5,}(?:\/[^/]+(?:\/file)?)?\/?$/i;

export function isMediafireFilePage(url = location.href) {
  return matchesDirectDownloadHostPath(url, {
    hostId: "mediafire",
    pathPattern: MEDIAFIRE_FILE_PATH,
    baseUrl: "https://mediafire.com/",
  });
}

function isHttpDownloadHref(href) {
  try {
    return ["http:", "https:"].includes(new URL(href).protocol);
  } catch {
    return false;
  }
}

async function waitForDownloadAnchor(timeoutMs = 12000, intervalMs = TIMINGS.POLL_INTERVAL) {
  const found = await waitForCandidate({
    timeoutMs,
    intervalMs: Math.max(1, intervalMs),
    getCandidate: () => {
      const button = queryFirstBySelectors(
        SELECTORS.MEDIAFIRE.DOWNLOAD_BUTTON_CANDIDATES,
      );
      if (button instanceof HTMLAnchorElement) {
        const href = getAnchorHref(button, window.location.href);
        if (href && isHttpDownloadHref(href)) return { button, href };
        // If href is still placeholder, trigger site init to progress state.
        try {
          if (typeof window.initDownload === "function") window.initDownload();
        } catch {
          // best effort
        }
      }
      return null;
    },
  });
  return found || { button: null, href: "" };
}

export async function processMediafireDownload({
  challengeGate,
  notifyMainFailure,
  reportAddonHealthy,
  downloadAnchorTimeoutMs = 12000,
  pollIntervalMs = TIMINGS.POLL_INTERVAL,
}) {
  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  const { button, href } = await waitForDownloadAnchor(
    downloadAnchorTimeoutMs,
    pollIntervalMs,
  );
  if (!button) {
    await notifyMainFailure("mediafire.com", "Download button not found.");
    return;
  }

  if (href) {
    if (challengeGate && !(await challengeGate.waitUntilClear())) return;
    window.location.assign(href);
    reportAddonHealthy();
    return;
  }

  try {
    if (challengeGate && !(await challengeGate.waitUntilClear())) return;
    if (!clickElement(button)) {
      await notifyMainFailure(
        "mediafire.com",
        "Unable to trigger download button.",
      );
      return;
    }
    reportAddonHealthy();
  } catch {
    await notifyMainFailure(
      "mediafire.com",
      "Unable to trigger download button.",
    );
  }
}
