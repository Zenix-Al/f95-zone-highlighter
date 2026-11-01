import { getElementText, isElementDisabled, isElementVisible } from "./shared/dom.js";
import { createHostAutomation } from "./shared/automation.js";

const FILE_PATH_PATTERN = /^\/view\/[^/]+\/file\.html\/?$/i;
const DOWNLOAD_BUTTON_SELECTOR = "button[type='submit'].btn.btn-primary";

export const processKrakenFilesDownload = createHostAutomation({
  id: "krakenfiles",
  canonicalHost: "krakenfiles.com",
  hostIncludes: ["krakenfiles.com", "www.krakenfiles.com"],
  text: "KrakenFiles",
  tooltip: "Enable direct download automation for krakenfiles.com",
  routes: [{ path: FILE_PATH_PATTERN }],
  routeError: "Unsupported KrakenFiles page.",
  mode: "sequence",
  actions: [
    {
      tool: "click",
      selectors: [DOWNLOAD_BUTTON_SELECTOR],
      validate: (button) =>
        button instanceof HTMLButtonElement &&
        !isElementDisabled(button) &&
        isElementVisible(button) &&
        getElementText(button).includes("download now"),
      revalidate: (button, find) => find() === button,
      prepare: ["scroll", "focus"],
      timeoutMs: 30000,
      graceMs: (options) => options.postClickGraceMs ?? 3000,
      final: true,
      errors: {
        missing: "Download now button not found.",
        changed: "Download button changed before dispatch.",
        click: "Unable to trigger the Download now button.",
      },
    },
  ],
});
