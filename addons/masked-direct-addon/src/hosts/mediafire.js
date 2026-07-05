import { SELECTORS, TIMINGS } from "../constants.js";
import { queryFirstBySelectors } from "../utils.js";
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
  showToast,
  notifyMainFailure,
  reportAddonHealthy,
}) {
  const { button, href } = await waitForDownloadAnchor();
  if (!button) {
    await notifyMainFailure("mediafire.com", "Download button not found.");
    return;
  }

  if (href) {
    window.location.assign(href);
    showToast("MediaFire download triggered.");
    reportAddonHealthy();
    return;
  }

  try {
    if (!clickElement(button)) {
      await notifyMainFailure(
        "mediafire.com",
        "Unable to trigger download button.",
      );
      return;
    }
    showToast("MediaFire download triggered.");
    reportAddonHealthy();
  } catch {
    await notifyMainFailure(
      "mediafire.com",
      "Unable to trigger download button.",
    );
  }
}
