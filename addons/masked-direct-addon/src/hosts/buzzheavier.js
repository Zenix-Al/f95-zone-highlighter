import { SELECTORS, TIMINGS } from "../constants.js";
import { queryFirstBySelectors, sleep } from "../utils.js";

function toDownloadEndpoint(button) {
  if (!(button instanceof HTMLAnchorElement)) return "";
  const source =
    button.getAttribute("hx-get") ||
    button.getAttribute("data-hx-get") ||
    button.getAttribute("href");
  if (!source) return "";
  try {
    return new URL(source, window.location.origin).href;
  } catch {
    return "";
  }
}

export async function processBuzzheavierDownload({
  showToast,
  notifyMainFailure,
  reportAddonHealthy,
}) {
  const button = queryFirstBySelectors(SELECTORS.BUZZHEAVIER.DOWNLOAD_BUTTON_CANDIDATES);
  if (!(button instanceof HTMLAnchorElement)) {
    await notifyMainFailure("buzzheavier.com", "Download button not found.");
    return;
  }

  const endpoint = toDownloadEndpoint(button);
  if (!endpoint) {
    await notifyMainFailure("buzzheavier.com", "Download endpoint not found.");
    return;
  }

  // Quick host-side sanity check before click so we can warn on known failures.
  try {
    const response = await fetch(endpoint, {
      headers: {
        "HX-Request": "true",
        "HX-Current-URL": window.location.href,
      },
      credentials: "include",
    });
    const text = await response.text();
    if (!response.ok || /could not be found/i.test(text)) {
      await notifyMainFailure("buzzheavier.com", "Host reported missing or unavailable file.");
      return;
    }
  } catch {
    await notifyMainFailure("buzzheavier.com", "Failed to contact download endpoint.");
    return;
  }

  button.click();
  showToast("Buzzheavier download triggered.");
  await sleep(Math.max(250, TIMINGS.POLL_INTERVAL));
  reportAddonHealthy();
}
