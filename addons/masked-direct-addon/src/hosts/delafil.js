import { TIMINGS } from "../constants.js";
import { queryAllBySelectors } from "../shared/utils.js";
import {
  clickElement,
  getAnchorHref,
  getElementText,
  isElementDisabled,
  isElementVisible,
  waitForCandidate,
} from "./shared/dom.js";
import { classifyFilePageUrl } from "./shared/filePage.js";

const HOST_LABEL = "delafil.se";
const FILE_PATH_PATTERN = /^\/[a-f0-9]{16,}\/[^/]+$/i;
const DOWNLOAD_LINK_SELECTORS = [
  "center a.btn[href]",
  "a.btn.btn-default[href]",
  "a[href]",
];

export function classifyDelafilPage(url = location.href) {
  const kind = classifyFilePageUrl(url, {
    pathPattern: FILE_PATH_PATTERN,
    terminalQueryKeys: ["pt", "download_token"],
  });
  return kind === "terminal" ? "tokenized" : kind;
}

function isDelafilDownloadAnchor(anchor) {
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  if (isElementDisabled(anchor) || !isElementVisible(anchor)) return false;

  const href = getAnchorHref(anchor);
  if (!href) return false;
  try {
    const current = new URL(location.href);
    const target = new URL(href);
    const isSameFile =
      target.origin === current.origin && target.pathname === current.pathname;
    const hasToken =
      target.searchParams.has("pt") ||
      target.searchParams.has("download_token");
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

function findDelafilDownloadAnchor() {
  return (
    queryAllBySelectors(DOWNLOAD_LINK_SELECTORS).find(
      isDelafilDownloadAnchor,
    ) || null
  );
}

export async function processDelafilDownload({
  challengeGate,
  notifyMainFailure,
  reportAddonHealthy,
}) {
  const pageKind = classifyDelafilPage();
  if (pageKind === "tokenized") {
    reportAddonHealthy();
    return;
  }
  if (pageKind !== "file") {
    await notifyMainFailure(HOST_LABEL, "Unsupported DelaFil page.");
    return;
  }

  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  const anchor = await waitForCandidate({
    timeoutMs: 20000,
    intervalMs: Math.max(250, TIMINGS.POLL_INTERVAL),
    getCandidate: findDelafilDownloadAnchor,
  });
  if (!anchor) {
    await notifyMainFailure(HOST_LABEL, "Download button not found.");
    return;
  }

  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  anchor.target = "_self";
  if (!clickElement(anchor)) {
    await notifyMainFailure(HOST_LABEL, "Unable to trigger download button.");
    return;
  }
  reportAddonHealthy();
}
