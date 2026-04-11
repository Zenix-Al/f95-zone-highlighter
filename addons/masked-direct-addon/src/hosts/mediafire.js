import { SELECTORS, TIMINGS } from "../constants.js";
import { queryFirstBySelectors, sleep } from "../utils.js";

function getDirectHref(button) {
  if (!(button instanceof HTMLAnchorElement)) return "";
  const href = String(button.getAttribute("href") || "").trim();
  if (!href || href === "#") return "";
  try {
    return new URL(href, window.location.href).href;
  } catch {
    return "";
  }
}

async function waitForDownloadAnchor(timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const button = queryFirstBySelectors(SELECTORS.MEDIAFIRE.DOWNLOAD_BUTTON_CANDIDATES);
    if (button instanceof HTMLAnchorElement) {
      const href = getDirectHref(button);
      if (href) return { button, href };
      // If href is still placeholder, trigger site init to progress state.
      try {
        if (typeof window.initDownload === "function") window.initDownload();
      } catch {
        // best effort
      }
    }
    await sleep(Math.max(250, TIMINGS.POLL_INTERVAL));
  }
  return { button: null, href: "" };
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
    button.click();
    showToast("MediaFire download triggered.");
    reportAddonHealthy();
  } catch {
    await notifyMainFailure("mediafire.com", "Unable to trigger download button.");
  }
}
