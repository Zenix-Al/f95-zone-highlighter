import {
  getElementText,
  isCountdownText,
  isElementDisabled,
  isElementVisible,
} from "./shared/dom.js";
import { createHostAutomation } from "./shared/automation.js";
const VIKING_CONTINUATION_HOST = "vik1ngfile.site";
const VIKING_FILE_PATH = /^\/f\/([a-z0-9_-]{5,64})\/?$/i;
const DOWNLOAD_BUTTON_CANDIDATES = ["a[href]", "button", 'input[type="button"]', ".btn"];

function isVik1ngDownloadButton(element) {
  const text = getElementText(element);
  if (!text || !text.includes("download")) return false;
  if (
    text.includes("generat") ||
    text.includes("prepar") ||
    text.includes("wait") ||
    isCountdownText(text)
  ) {
    return false;
  }
  return isElementVisible(element) && !isElementDisabled(element);
}

export const processVik1ngfileDownload = createHostAutomation({
  id: "vik1ngfile",
  canonicalHost: "vik1ngfile.site",
  hostIncludes: ["vik1ngfile.site", "vikingfile.com"],
  text: "Vik1ngFile",
  tooltip: "Enable direct download automation for vik1ngfile.site and vikingfile.com",
  routes: [
    { path: VIKING_FILE_PATH, entry: { identity: 1, nextStage: "vik1ngfile-page" } },
    {
      path: VIKING_FILE_PATH,
      hosts: [VIKING_CONTINUATION_HOST],
      allow: false,
      continuation: { identity: 1, nextStage: "vik1ngfile-page" },
    },
  ],
  actions: [
    {
      tool: "click",
      selectors: DOWNLOAD_BUTTON_CANDIDATES,
      validate: isVik1ngDownloadButton,
      timeoutMs: 20000,
      graceMs: (o) => o.stepDelayMs ?? 1200,
      final: (o) => !o.automationDecision?.standaloneEntry,
      errors: {
        missing: "Download button not found.",
        changed: "Unable to trigger download button.",
        click: "Unable to trigger download button.",
      },
    },
  ],
});
