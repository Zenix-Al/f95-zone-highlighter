import { SELECTORS, TIMINGS } from "./constants.js";
import { queryFirstBySelectors } from "../shared/utils.js";
import { getAnchorHref } from "./shared/dom.js";
import { createHostAutomation } from "./shared/automation.js";
const MEDIAFIRE_FILE_PATH = /^\/(?:file|file_premium)\/[a-z0-9]{5,}(?:\/[^/]+(?:\/file)?)?\/?$/i;

function isHttpDownloadHref(href) {
  try {
    return ["http:", "https:"].includes(new URL(href).protocol);
  } catch {
    return false;
  }
}

export const processMediafireDownload = createHostAutomation({
  id: "mediafire",
  canonicalHost: "mediafire.com",
  hostIncludes: ["mediafire.com", "www.mediafire.com"],
  text: "MediaFire",
  tooltip: "Enable direct download automation for mediafire.com",
  routes: [{ path: MEDIAFIRE_FILE_PATH }],
  actions: [
    {
      tool: "navigate",
      select: () => queryFirstBySelectors(SELECTORS.MEDIAFIRE.DOWNLOAD_BUTTON_CANDIDATES),
      ready: (element) =>
        element instanceof HTMLAnchorElement && isHttpDownloadHref(getAnchorHref(element)),
      initialize: "initDownload",
      timeoutMs: (o) => o.downloadAnchorTimeoutMs ?? 12000,
      intervalMs: (o) => o.pollIntervalMs ?? TIMINGS.POLL_INTERVAL,
      read: getAnchorHref,
      url: (element) => getAnchorHref(element),
      final: true,
      errors: {
        missing: "Download button not found.",
        changed: "Download link changed before dispatch.",
      },
    },
  ],
});
