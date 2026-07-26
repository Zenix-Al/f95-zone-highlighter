import { SELECTORS, TIMINGS } from "../constants.js";
import { queryFirstBySelectors } from "../shared/utils.js";
import { clickElement, getAnchorHref, waitForCandidate } from "./shared/dom.js";

async function waitForDownloadAnchor(timeoutMs = 12000) {
  const found = await waitForCandidate({
    timeoutMs,
    intervalMs: Math.max(250, TIMINGS.POLL_INTERVAL),
    getCandidate: () => {
      const button = queryFirstBySelectors(
        SELECTORS.MEDIAFIRE.DOWNLOAD_BUTTON_CANDIDATES,
      );
      if (button instanceof HTMLAnchorElement) {
        const href = getAnchorHref(button, window.location.href);
        if (href) return { button, href };
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
}) {
  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  const { button, href } = await waitForDownloadAnchor();
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
