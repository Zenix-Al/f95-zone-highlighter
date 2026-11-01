import { queryAllBySelectors } from "../shared/utils.js";
import {
  getAnchorHref,
  getElementText,
  isElementDisabled,
  isElementVisible,
} from "./shared/dom.js";
import { createHostAutomation } from "./shared/automation.js";
const HOST_LABEL = "MixDrop";
const FILE_PATH_PATTERN = /^\/f\/[^/]+\/?$/i;
export const MIXDROP_POST_CLICK_GRACE_MS = 10000;
const DOWNLOAD_BUTTON_SELECTORS = ["a.download-btn", "a.btn.btn3.download-btn"];

function isMixdropButton(anchor) {
  return (
    anchor instanceof HTMLAnchorElement &&
    isElementVisible(anchor) &&
    !isElementDisabled(anchor) &&
    getElementText(anchor).includes("download")
  );
}

function hasUsableDownloadHref(anchor) {
  const href = getAnchorHref(anchor);
  if (!href) return false;
  try {
    const protocol = new URL(href).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function findMixdropButton({ requireHref = false } = {}) {
  return (
    queryAllBySelectors(DOWNLOAD_BUTTON_SELECTORS).find(
      (anchor) => isMixdropButton(anchor) && (!requireHref || hasUsableDownloadHref(anchor)),
    ) || null
  );
}

export const processMixdropDownload = createHostAutomation({
  id: "mixdrop",
  canonicalHost: "miiiixdrop.net",
  hostIncludes: ["mixdrop.ag", "miixdrop.com", "miiixdrop.net", "miiiixdrop.net"],
  text: "MixDrop",
  tooltip: "Enable two-stage direct download automation for MixDrop",
  routes: [{ path: FILE_PATH_PATTERN }],

  host: HOST_LABEL,
  routeError: "Unsupported MixDrop page.",
  actions: [
    {
      tool: "click",
      select: findMixdropButton,
      validate: isMixdropButton,
      skipDispatch: hasUsableDownloadHref,
      timeoutMs: 30000,
      errors: {
        missing: "Initial download button not found.",
        changed: "Initial download button changed before dispatch.",
        click: "Unable to trigger initial download button.",
      },
    },
    { tool: "delay", ms: (o) => o.secondStageDelayMs ?? 5000 },
    {
      tool: "click",
      select: () => findMixdropButton({ requireHref: true }),
      validate: (element) => isMixdropButton(element) && hasUsableDownloadHref(element),
      timeoutMs: 60000,
      prepare: ["self", "removeRel"],
      final: true,
      graceMs: (o) => o.postClickGraceMs ?? MIXDROP_POST_CLICK_GRACE_MS,
      errors: {
        missing: "Final download link not found.",
        changed: "Final link changed before dispatch.",
        click: "Unable to trigger final download link.",
      },
    },
  ],
});

export const MIXDROP_HOST_ALIASES = processMixdropDownload.definition.hostIncludes;
