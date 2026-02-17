import { config } from "../../config.js";
import TIMINGS from "../../config/timings.js";
import { SELECTORS } from "../../config/selectors.js";
import { debugLog } from "../../core/logger.js";
import { saveConfigKeys } from "../../services/settingsService.js";
import { showToast } from "../../ui/components/toast.js";
import { styleDownloadSuccess } from "../../utils/helpers.js";
import { publishDirectDownloadAttention } from "./attention.js";

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
      const text = String(el.textContent || "").trim().toLowerCase();

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

async function clearFlagAndTryClose() {
  await saveConfigKeys({ processingDownload: false });
  try {
    window.close();
  } catch (e) {
    console.warn("Close blocked (normal if tab not script-opened)", e);
    const msg = document.createElement("div");
    msg.innerHTML = `
      <div>
        Download started! You can close this tab now.
      </div>
    `;
    const el = msg.firstElementChild;
    styleDownloadSuccess(el, { background: "#ec5555", color: "white" });
    document.body.appendChild(el);
  }
}

export async function processPixeldrainDownload() {
  if (!config.threadSettings.directDownloadLinks || !config.processingDownload) return;

  try {
    debugLog("PixeldrainDownloader", "Waiting for download button...");
    const downloadButton = await waitForDownloadButton();
    debugLog("PixeldrainDownloader", "Download button found, triggering click.");

    downloadButton.click();
    showToast("Pixeldrain download triggered.");

    setTimeout(() => {
      void clearFlagAndTryClose();
    }, TIMINGS.PIXELDRAIN_AUTO_CLOSE);
  } catch (err) {
    const message = `Pixeldrain automation failed: ${err?.message || String(err)}`;
    debugLog("PixeldrainDownloader", message, { level: "warn" });
    showToast(message);
    await publishDirectDownloadAttention("pixeldrain.com", message, "button_not_found");
    await saveConfigKeys({ processingDownload: false });
  }
}

