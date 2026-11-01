import { SELECTORS, TIMINGS } from "./constants.js";
import { queryFirstBySelectors } from "../shared/utils.js";
import { getElementAttributeUrl } from "./shared/dom.js";
import { createHostAutomation } from "./shared/automation.js";
const BUZZHEAVIER_FILE_PATH = /^\/[a-z0-9_-]{8,64}\/?$/i;

function toDownloadEndpoint(button) {
  if (!(button instanceof HTMLAnchorElement)) return "";
  return getElementAttributeUrl(button, ["hx-get", "data-hx-get", "href"], window.location.origin);
}

export const processBuzzheavierDownload = createHostAutomation({
  id: "buzzheavier",
  canonicalHost: "buzzheavier.com",
  hostIncludes: ["buzzheavier.com", "bzzhr.to"],
  text: "Buzzheavier",
  tooltip: "Enable direct download automation for buzzheavier.com and bzzhr.to",
  routes: [{ path: BUZZHEAVIER_FILE_PATH }],

  host: () => (location.hostname === "bzzhr.to" ? "bzzhr.to" : "buzzheavier.com"),
  actions: [
    {
      tool: "click",
      select: () => queryFirstBySelectors(SELECTORS.BUZZHEAVIER.DOWNLOAD_BUTTON_CANDIDATES),
      timeoutMs: (o) => o.buttonWaitTimeoutMs ?? TIMINGS.BUZZHEAVIER_DOWNLOAD_BUTTON_WAIT_TIMEOUT,
      intervalMs: (o) => o.pollIntervalMs ?? TIMINGS.POLL_INTERVAL,
      read: toDownloadEndpoint,
      check: (element, endpoint) => {
        try {
          const url = new URL(endpoint);
          return (
            element instanceof HTMLAnchorElement &&
            url.origin === location.origin &&
            url.pathname.endsWith("/download")
          );
        } catch {
          return false;
        }
      },
      final: true,
      errors: {
        missing: "Download button not found.",
        invalid: "Download endpoint not found.",
        changed: "Download endpoint changed before dispatch.",
        click: "Unable to trigger download button.",
      },
    },
  ],
});
