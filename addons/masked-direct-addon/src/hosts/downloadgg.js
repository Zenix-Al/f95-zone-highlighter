import { getElementText, isElementDisabled, isElementVisible } from "./shared/dom.js";
import { createHostAutomation } from "./shared/automation.js";

export const DOWNLOAD_GG_POST_CLICK_GRACE_MS = 8000;
const FILE_PATH_PATTERN = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?file-[a-z0-9_-]+\/?$/i;
const DOWNLOAD_BUTTON_SELECTORS = [
  "button.downloadAttachment",
  'button.downloadAttachment[type="submit"]',
  'button.btn-file[type="submit"]',
  'form button.btn-pink[type="submit"]',
];

function isDownloadButton(button) {
  if (!(button instanceof HTMLButtonElement)) return false;
  if (isElementDisabled(button) || !isElementVisible(button)) return false;
  const text = getElementText(button);
  return (
    button.classList.contains("downloadAttachment") ||
    text.includes("download") ||
    Boolean(button.querySelector(".fa-download, .fas.fa-download"))
  );
}

export const processDownloadGg = createHostAutomation({
  id: "downloadgg",
  canonicalHost: "download.gg",
  hostIncludes: ["download.gg", "www.download.gg"],
  text: "download.gg",
  tooltip: "Enable direct download automation for download.gg",
  routes: [{ path: FILE_PATH_PATTERN }],
  routeError: "Unsupported download.gg page.",
  mode: "sequence",
  actions: [
    {
      tool: "click",
      selectors: DOWNLOAD_BUTTON_SELECTORS,
      validate: isDownloadButton,
      timeoutMs: 20000,
      graceMs: (options) => options.postClickGraceMs ?? DOWNLOAD_GG_POST_CLICK_GRACE_MS,
      final: true,
      errors: {
        missing: "Download button not found.",
        changed: "Download button changed before dispatch.",
        click: "Unable to trigger download button.",
      },
    },
  ],
});
