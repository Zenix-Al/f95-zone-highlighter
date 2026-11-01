import {
  getAnchorHref,
  getElementText,
  isElementDisabled,
  isElementVisible,
} from "./shared/dom.js";
import { createHostAutomation } from "./shared/automation.js";
const FILE_PATH_PATTERN = /^\/[a-f0-9]{16,}\/[^/]+$/i;
const DOWNLOAD_LINK_SELECTORS = ["center a.btn[href]", "a.btn.btn-default[href]", "a[href]"];

function isDelafilDownloadAnchor(anchor) {
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  if (isElementDisabled(anchor) || !isElementVisible(anchor)) return false;

  const href = getAnchorHref(anchor);
  if (!href) return false;
  try {
    const current = new URL(location.href);
    const target = new URL(href);
    const isSameFile = target.origin === current.origin && target.pathname === current.pathname;
    const hasToken = target.searchParams.has("pt") || target.searchParams.has("download_token");
    const text = getElementText(anchor);
    const looksActionable =
      anchor.matches(".btn, .btn-default") ||
      text.includes("ladda ner") ||
      text.includes("download");
    return isSameFile && hasToken && looksActionable;
  } catch {
    return false;
  }
}

export const processDelafilDownload = createHostAutomation({
  id: "delafil",
  canonicalHost: "delafil.se",
  hostIncludes: ["delafil.se"],
  text: "DelaFil",
  tooltip: "Enable direct download automation for delafil.se",
  routes: [
    { path: FILE_PATH_PATTERN, terminalKeys: ["pt", "download_token"], terminalKind: "tokenized" },
  ],
  routeError: "Unsupported DelaFil page.",
  actions: [
    { tool: "healthy", whenRoute: "tokenized" },
    {
      tool: "click",
      selectors: DOWNLOAD_LINK_SELECTORS,
      validate: isDelafilDownloadAnchor,
      timeoutMs: 20000,
      prepare: ["self"],
      final: true,
      errors: {
        missing: "Download button not found.",
        changed: "Download link changed before dispatch.",
        click: "Unable to trigger download button.",
      },
    },
  ],
});
