import { config } from "../../config.js";
import TIMINGS from "../../config/timings.js";
import { debugLog } from "../../core/logger.js";
import { showToast } from "../../ui/components/toast.js";
import { handleDirectDownloadFailure } from "./attention.js";
import { isDirectDownloadHostEnabled } from "./hostPackages.js";
import {
  isProcessingDownloadFlowActive,
  markHostDownloadSuccess,
  scheduleDirectDownloadCompletion,
} from "./hostFlowHelpers.js";

const PIXELDRAIN_ID_REGEX = /^[A-Za-z0-9_-]{6,32}$/;

function isValidPixeldrainId(id) {
  return PIXELDRAIN_ID_REGEX.test(String(id || ""));
}

function getPixeldrainFileIdFromLocation() {
  const match = window.location.pathname.match(/\/(?:u|d|f)\/([A-Za-z0-9_-]+)/);
  return isValidPixeldrainId(match?.[1]) ? match[1] : "";
}

function getPixeldrainFileIdFromDom() {
  const thumbnail = document.querySelector('img[src*="/api/file/"]');
  const thumbnailMatch = thumbnail?.getAttribute("src")?.match(/\/api\/file\/([^/?#]+)/);
  if (isValidPixeldrainId(thumbnailMatch?.[1])) return thumbnailMatch[1];

  const apiLink = document.querySelector('a[href*="/api/file/"]');
  const apiLinkMatch = apiLink?.getAttribute("href")?.match(/\/api\/file\/([^/?#]+)/);
  if (isValidPixeldrainId(apiLinkMatch?.[1])) return apiLinkMatch[1];

  return "";
}

function getPixeldrainFileId() {
  return getPixeldrainFileIdFromLocation() || getPixeldrainFileIdFromDom();
}

function buildDirectDownloadUrl(fileId) {
  return `${window.location.origin}/api/file/${encodeURIComponent(fileId)}?download`;
}

function triggerDirectDownload(url) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_self";
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    try {
      anchor.remove();
    } catch {
      // no-op cleanup best effort
    }
  }, 2000);
}

function triggerButtonFallback() {
  const fallbackButton = document.querySelector("button.button_highlight");
  if (!fallbackButton) return false;
  fallbackButton.click();
  return true;
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
    const fileId = getPixeldrainFileId();
    if (fileId) {
      const directUrl = buildDirectDownloadUrl(fileId);
      debugLog("PixeldrainDownloader", "Triggering direct URL download.", {
        data: { fileId, directUrl },
      });
      triggerDirectDownload(directUrl);
    } else {
      debugLog("PixeldrainDownloader", "File ID not found; falling back to page download button.", {
        level: "warn",
      });
      const clicked = triggerButtonFallback();
      if (!clicked) {
        throw new Error("Could not find Pixeldrain file ID or fallback download button.");
      }
    }

    await markHostDownloadSuccess("pixeldrain");
    showToast("Pixeldrain download triggered.");
    scheduleDirectDownloadCompletion("PixeldrainDownloader", TIMINGS.PIXELDRAIN_AUTO_CLOSE);
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
