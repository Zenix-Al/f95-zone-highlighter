import { TIMINGS } from "../constants.js";
import { queryAllBySelectors, sleep } from "../utils.js";
import {
  getElementText,
  isCountdownText,
  isElementDisabled,
  isElementVisible,
} from "./shared/dom.js";

// Kept as parked host research. Vik1ngFile currently presents Cloudflare human
// verification, so this handler is intentionally not registered as supported.
const DOWNLOAD_BUTTON_CANDIDATES = ["a[href]", "button", 'input[type="button"]', ".btn"];

function isVik1ngDownloadButton(element) {
  const text = getElementText(element);
  if (!text) return false;
  if (!text.includes("download") && !text.includes("скачать")) return false;
  if (text.includes("generat")) return false;
  if (text.includes("подготов")) return false;
  if (text.includes("wait") || isCountdownText(text)) return false;
  return isElementVisible(element) && !isElementDisabled(element);
}

function findVik1ngDownloadButton() {
  const candidates = queryAllBySelectors(DOWNLOAD_BUTTON_CANDIDATES);
  return candidates.find(isVik1ngDownloadButton) || null;
}

async function waitForVik1ngDownloadButton(timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const button = findVik1ngDownloadButton();
    if (button) return button;
    await sleep(Math.max(250, TIMINGS.POLL_INTERVAL));
  }
  return null;
}

export async function processVik1ngfileDownload({
  showToast,
  notifyMainFailure,
  reportAddonHealthy,
}) {
  let firstClickDone = false;

  for (let step = 0; step < 2; step += 1) {
    const button = await waitForVik1ngDownloadButton(firstClickDone ? 30000 : 20000);
    if (!button) {
      await notifyMainFailure(
        "vik1ngfile.site",
        firstClickDone ? "Final download button not found." : "Download button not found.",
      );
      return;
    }

    try {
      button.click();
      firstClickDone = true;
      await sleep(1200);
    } catch {
      await notifyMainFailure("vik1ngfile.site", "Unable to trigger download button.");
      return;
    }
  }

  showToast("Vik1ngFile download triggered.");
  reportAddonHealthy();
}
