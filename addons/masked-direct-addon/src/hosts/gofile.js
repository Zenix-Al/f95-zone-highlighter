import { TIMINGS, SELECTORS } from "./constants.js";
import { createHostAutomation } from "./shared/automation.js";
const GOFILE_CONTENT_PATH = /^\/d\/[a-z0-9_-]{5,64}\/?$/i;

function inspectGofileDownloadPage() {
  const buttons = [...document.querySelectorAll(SELECTORS.GOFILE.DOWNLOAD_BUTTON)];
  const singleFileButton = buttons.find((button) => !button.closest(SELECTORS.GOFILE.ITEM_ROW));
  const rows = [...document.querySelectorAll(SELECTORS.GOFILE.ITEM_ROW)];
  if (rows.length > 1 || (rows.length === 1 && rows[0].dataset.type !== "file")) {
    return { status: "unsafe", itemCount: rows.length };
  }
  if (singleFileButton) {
    return { status: "ready", button: singleFileButton };
  }

  if (rows.length !== 1) return { status: "loading", itemCount: 0 };

  const button = rows[0].querySelector(SELECTORS.GOFILE.DOWNLOAD_BUTTON);
  return button ? { status: "ready", button } : { status: "loading", itemCount: 1 };
}

export const processGofileDownload = createHostAutomation({
  id: "gofile",
  canonicalHost: "gofile.io",
  hostIncludes: ["gofile.io"],
  text: "Gofile package",
  tooltip: "Enable direct download automation for gofile.io",
  routes: [{ path: GOFILE_CONTENT_PATH }],
  actions: [
    {
      tool: "click",
      inspect: inspectGofileDownloadPage,
      final: true,
      timeoutMs: (o) => o.contentReadyTimeoutMs ?? 20000,
      intervalMs: (o) => o.pollIntervalMs ?? TIMINGS.POLL_INTERVAL,
      readyDelayMs: (o) => o.postReadyWaitMs ?? TIMINGS.GOFILE_POST_READY_WAIT,
      errors: {
        missing: "Failed to load a download action.",
        changed: "Unable to trigger Gofile's download action.",
        click: "Unable to trigger Gofile's download action.",
      },
    },
  ],
});
