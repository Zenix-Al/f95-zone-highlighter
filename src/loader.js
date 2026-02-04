// src/loader.js
import { config, state } from "./config";
import { debugLog } from "./core/logger";
import { waitFor } from "./core/dom";

// Features
import { executeAutoRetry } from "./features/autoRetryDownload";
import { initNoticeDismissal } from "./features/notificationCloser";
import {
  toggleDenseLatestGrid,
  watchAndUpdateTiles,
  processAllTiles,
  handleWebClick,
  toggleWideLatestPage,
} from "./features/latestService";
import { injectImageRepair } from "./features/imageService";
import { signatureCollapse, processThreadTags } from "./features/threadService";
import { hijackMaskedLinks } from "./features/maskedLinkSkipper";
import { processGofileDownload } from "./features/gofile";
import { handleDownload } from "./features/fileHostHelper";
import { hicjackLink } from "./features/hijackDownloadLink";
import { handleMsgEvent } from "./features/msgHandler";
import { wideForum } from "./features/wideForum";

async function loadLatestPageFeatures() {
  try {
    await waitFor(() => document.getElementById("latest-page_items-wrap"));
    debugLog("Loader", "Latest page features loading...");

    if (config.latestSettings.wideLatest) toggleWideLatestPage();
    if (config.latestSettings.denseLatestGrid) toggleDenseLatestGrid();
    if (config.latestSettings.webNotif) handleWebClick();

    watchAndUpdateTiles(); // This handles observing and processing tiles
    processAllTiles(); // Initial run
  } catch (err) {
    console.warn("Observer container not found on latest page, some features may not work.", err);
  }
}

function loadThreadPageFeatures() {
  debugLog("Loader", "Thread page features loading...");

  if (config.threadSettings.threadOverlayToggle) processThreadTags();
  if (config.threadSettings.isWide) wideForum();
  if (config.threadSettings.imgRetry) injectImageRepair();
  if (config.threadSettings.collapseSignature) signatureCollapse();
  if (config.threadSettings.skipMaskedLink) hijackMaskedLinks();
  if (config.threadSettings.directDownloadLinks) {
    debugLog("Init", "Direct download links enabled");
    hicjackLink();
    handleMsgEvent();
  }
}

function loadDownloadPageFeatures() {
  debugLog("Init", `Download page detected: ${state.isDownloadPage}`);
  if (state.isDownloadPage === "buzzheavier.com") {
    handleDownload("buzzheavier.com");
  } else if (state.isDownloadPage === "gofile.io") {
    processGofileDownload();
  }
}

export function loadFeatures() {
  if (state.isLatest) {
    loadLatestPageFeatures();
  }
  if (state.isThread) {
    loadThreadPageFeatures();
  }
  if (state.isDownloadPage) {
    loadDownloadPageFeatures();
  }
  if (state.isDirectDownloadPage) {
    executeAutoRetry(state.isDirectDownloadPage.host);
  }
  if (state.isF95Zone) {
    // Global features for f95zone
    initNoticeDismissal();
  }
}
