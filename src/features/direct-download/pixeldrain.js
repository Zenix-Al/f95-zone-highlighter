import { config } from "../../config.js";
import TIMINGS from "../../config/timings.js";
import { SELECTORS } from "../../config/selectors.js";
import { debugLog } from "../../core/logger.js";
import { showToast } from "../../ui/components/toast.js";
import { handleDirectDownloadFailure } from "./attention.js";
import { isDirectDownloadHostEnabled } from "./hostPackages.js";
import {
  clearProcessingAndTryCloseTab,
  isProcessingDownloadFlowActive,
  markHostDownloadSuccess,
} from "./hostFlowHelpers.js";

function isLikelyVisible(element) {
  if (!element || !element.isConnected) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function getDownloadButtonCandidate() {
  const candidates = Array.from(
    document.querySelectorAll(SELECTORS.PIXELDRAIN.DOWNLOAD_BUTTON_CANDIDATES),
  );
  if (candidates.length === 0) return null;

  const ranked = candidates
    .map((el) => {
      const spanText = String(el.querySelector("span")?.textContent || "")
        .trim()
        .toLowerCase();
      const iconText = String(el.querySelector("i.icon")?.textContent || "")
        .trim()
        .toLowerCase();
      const text = String(el.textContent || "")
        .trim()
        .toLowerCase();

      let score = 0;
      if (spanText === "download") score += 4;
      if (iconText === "download") score += 3;
      if (text.includes("download")) score += 2;
      if (el.tagName === "BUTTON") score += 1;
      if (isLikelyVisible(el)) score += 1;

      return { el, score };
    })
    .filter(({ score }) => score >= 4)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.el || null;
}

function waitForDownloadButton(timeout = TIMINGS.PIXELDRAIN_BUTTON_WAIT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      const btn = getDownloadButtonCandidate();
      if (btn) {
        resolve(btn);
        return;
      }

      if (Date.now() - start > timeout) {
        reject(new Error("Download button not found."));
        return;
      }

      setTimeout(check, TIMINGS.PIXELDRAIN_POLL_INTERVAL);
    };

    check();
  });
}

export async function processPixeldrainDownload() {
  const isProcessing = await isProcessingDownloadFlowActive();
  if (
    !config.threadSettings.directDownloadLinks ||
    !isProcessing ||
    !isDirectDownloadHostEnabled(location.hostname)
  )
    return;

  try {
    debugLog("PixeldrainDownloader", "Waiting for download button...");
    const downloadButton = await waitForDownloadButton();
    debugLog("PixeldrainDownloader", "Download button found, triggering click.");

    downloadButton.click();
    await markHostDownloadSuccess("pixeldrain");
    showToast("Pixeldrain download triggered.");

    setTimeout(() => {
      void clearProcessingAndTryCloseTab();
    }, TIMINGS.PIXELDRAIN_AUTO_CLOSE);
  } catch (err) {
    const message = `Pixeldrain automation failed: ${err?.message || String(err)}`;
    debugLog("PixeldrainDownloader", message, { level: "warn" });
    await handleDirectDownloadFailure({
      packageKey: "pixeldrain",
      host: "pixeldrain.com",
      message,
      code: "button_not_found",
      trippedToast: "Pixeldrain auto-disabled after 3 consecutive failures.",
    });
  }
}
