import { SELECTORS } from "../constants.js";
import { queryFirstBySelectors } from "../shared/utils.js";
import { clickElement, getElementAttributeUrl } from "./shared/dom.js";

function toDownloadEndpoint(button) {
  if (!(button instanceof HTMLAnchorElement)) return "";
  return getElementAttributeUrl(
    button,
    ["hx-get", "data-hx-get", "href"],
    window.location.origin,
  );
}

export async function processBuzzheavierDownload({
  showToast,
  notifyMainFailure,
  reportAddonHealthy,
}) {
  const hostLabel = location.hostname.includes("bzzhr.to")
    ? "bzzhr.to"
    : "buzzheavier.com";
  const button = queryFirstBySelectors(
    SELECTORS.BUZZHEAVIER.DOWNLOAD_BUTTON_CANDIDATES,
  );
  if (!(button instanceof HTMLAnchorElement)) {
    await notifyMainFailure(hostLabel, "Download button not found.");
    return;
  }

  const endpoint = toDownloadEndpoint(button);
  if (!endpoint) {
    await notifyMainFailure(hostLabel, "Download endpoint not found.");
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
      await notifyMainFailure(
        hostLabel,
        "Host reported missing or unavailable file.",
      );
      return;
    }
  } catch {
    await notifyMainFailure(hostLabel, "Failed to contact download endpoint.");
    return;
  }

  if (!clickElement(button)) {
    await notifyMainFailure(hostLabel, "Unable to trigger download button.");
    return;
  }
  showToast("Buzzheavier download triggered.");
  reportAddonHealthy();
}
