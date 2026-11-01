import { isElementDisabled, isElementVisible } from "./shared/dom.js";
import { createHostAutomation } from "./shared/automation.js";
const SHARE_PATH_PATTERN = /^\/[a-z]{2}(?:-[a-z]{2})?\/share\/?$/i;
const DOWNLOAD_ICON_SELECTOR = 'svg[data-icon="arrow-down-to-line"]';

function findDownloadButtons() {
  const preferred = Array.from(
    document.querySelectorAll('button[class*="file_browser_alt_options__"]'),
  );
  const candidates =
    preferred.length > 0 ? preferred : Array.from(document.querySelectorAll("button"));
  return [...new Set(candidates)].filter(
    (button) =>
      button instanceof HTMLButtonElement &&
      button.querySelector(DOWNLOAD_ICON_SELECTOR) &&
      !isElementDisabled(button) &&
      isElementVisible(button),
  );
}

function inspectSingleFile() {
  const buttons = findDownloadButtons();
  if (buttons.length > 1)
    return {
      status: "unsafe",
      message: `Automatic download requires exactly one file; found ${buttons.length}.`,
    };
  return buttons.length === 1 ? { status: "ready", element: buttons[0] } : { status: "loading" };
}
export const processUploadNowDownload = createHostAutomation({
  id: "uploadnow",
  canonicalHost: "uploadnow.io",
  hostIncludes: ["uploadnow.io", "www.uploadnow.io"],
  text: "UploadNow",
  tooltip: "Enable single-file direct download automation for uploadnow.io",
  routes: [{ path: SHARE_PATH_PATTERN }],
  routeError: "Unsupported UploadNow page.",
  actions: [
    {
      tool: "click",
      inspect: inspectSingleFile,
      final: true,
      prepare: ["scroll", "focus"],
      timeoutMs: (o) => o.timeoutMs ?? 30000,
      intervalMs: (o) => o.intervalMs ?? 500,
      stableChecks: (o) => o.stableChecksRequired ?? 4,
      errors: {
        missing: "No download buttons became stable before the deadline.",
        changed: "Download button changed before dispatch.",
        click: "Unable to trigger the download.",
      },
    },
  ],
});
