import { TIMINGS, SELECTORS } from "../constants.js";
import { sleep } from "../shared/utils.js";
import { clickElement } from "./shared/dom.js";
import { matchesDirectDownloadHostPath } from "./shared/filePage.js";

const GOFILE_CONTENT_PATH = /^\/d\/[a-z0-9_-]{5,64}\/?$/i;

export function isGofileContentPage(url = location.href) {
  return matchesDirectDownloadHostPath(url, {
    hostId: "gofile",
    pathPattern: GOFILE_CONTENT_PATH,
    baseUrl: "https://gofile.io/",
  });
}

function inspectGofileDownloadPage() {
  const buttons = [
    ...document.querySelectorAll(SELECTORS.GOFILE.DOWNLOAD_BUTTON),
  ];
  const singleFileButton = buttons.find(
    (button) => !button.closest(SELECTORS.GOFILE.ITEM_ROW),
  );
  if (singleFileButton) {
    return { status: "ready", button: singleFileButton };
  }

  const rows = [
    ...document.querySelectorAll(SELECTORS.GOFILE.ITEM_ROW),
  ];
  if (rows.length > 1) {
    return { status: "unsafe", itemCount: rows.length };
  }
  if (rows.length !== 1) return { status: "loading", itemCount: 0 };
  if (rows[0].dataset.type !== "file") {
    return { status: "unsafe", itemCount: 1 };
  }

  const button = rows[0].querySelector(SELECTORS.GOFILE.DOWNLOAD_BUTTON);
  return button
    ? { status: "ready", button }
    : { status: "loading", itemCount: 1 };
}

async function waitForGofileDownload({
  challengeGate,
  timeoutMs,
  pollIntervalMs,
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (challengeGate && !(await challengeGate.waitUntilClear())) {
      return { status: "cancelled" };
    }
    const result = inspectGofileDownloadPage();
    if (result.status !== "loading") return result;
    await sleep(pollIntervalMs);
  }
  return { status: "timeout" };
}

export async function processGofileDownload({
  challengeGate,
  notifyMainFailure,
  reportAddonHealthy,
  contentReadyTimeoutMs = 20000,
  pollIntervalMs = TIMINGS.POLL_INTERVAL,
  postReadyWaitMs = TIMINGS.GOFILE_POST_READY_WAIT,
}) {
  const result = await waitForGofileDownload({
    challengeGate,
    timeoutMs: contentReadyTimeoutMs,
    pollIntervalMs,
  });
  if (result.status === "cancelled") return;
  if (result.status === "unsafe") {
    await notifyMainFailure(
      "gofile.io",
      "Automation requires exactly one file.",
    );
    return;
  }
  if (result.status !== "ready") {
    await notifyMainFailure("gofile.io", "Failed to load a download action.");
    return;
  }

  await sleep(postReadyWaitMs);
  if (challengeGate && !(await challengeGate.waitUntilClear())) return;
  if (!result.button.isConnected || !clickElement(result.button)) {
    await notifyMainFailure(
      "gofile.io",
      "Unable to trigger Gofile's download action.",
    );
    return;
  }

  reportAddonHealthy();
}
