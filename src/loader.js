// src/loader.js
import { config, state } from "./config";
import { debugLog } from "./core/logger";

// Features
import { executeAutoRetry } from "./features/direct-download/autoRetryDownload.js";
import { toggleNoticeDismissal } from "./features/dismiss-notification/index.js";
import { enableLatestOverlay } from "./features/latest-overlay/latest-overlay.js";
import { toggleWideLatestPage } from "./features/wide-latest/wide-latest-page.js";
import { toggleDenseLatestGrid } from "./features/wide-latest/dense-latest-page.js";
import { enableLatestControls } from "./features/latest-control/latest-controls.js";
import { toggleImageRepair } from "./features/image-repair/index.js";
import { signatureCollapse } from "./features/signature-collapse/index.js";
import { processThreadTags } from "./features/thread-overlay/index.js";
import { hijackMaskedLinks, handleRecaptcha } from "./features/masked-link-skipper/index.js";
import { handleDownload } from "./features/direct-download/fileHostHelper.js";
import { enableDirectDownload } from "./features/direct-download/index.js";
import { handleMsgEvent } from "./features/direct-download/msgHandler.js";
import { wideForum } from "./features/wideForum/index";

function loadLatestPageFeatures() {
  debugLog("Loader", "Latest page features loading...");

  // These features are self-contained. They handle their own initialization,
  // including waiting for DOM elements and setting up observers if necessary.
  if (config.latestSettings.wideLatest) toggleWideLatestPage();
  if (config.latestSettings.denseLatestGrid) toggleDenseLatestGrid();
  if (config.latestSettings.webNotif || config.latestSettings.autoRefresh) enableLatestControls();

  // Initialize overlays if the feature is enabled. The feature itself
  // handles waiting for content and setting up its own observer.
  if (config.latestSettings.latestOverlayToggle) enableLatestOverlay();
}

function loadThreadPageFeatures() {
  debugLog("Loader", "Thread page features loading...");

  if (config.threadSettings.threadOverlayToggle) processThreadTags();
  if (config.threadSettings.isWide) wideForum();
  if (config.threadSettings.imgRetry) toggleImageRepair();
  if (config.threadSettings.collapseSignature) signatureCollapse();
  if (config.threadSettings.skipMaskedLink) hijackMaskedLinks();
  if (config.threadSettings.directDownloadLinks) {
    debugLog("Init", "Direct download links enabled");
    enableDirectDownload();
    handleMsgEvent();
  }
}

function loadDownloadPageFeatures() {
  if (state.isDownloadPage) {
    debugLog("Init", `Download page detected: ${state.isDownloadPage}`);
    handleDownload(state.isDownloadPage);
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
    toggleNoticeDismissal();
  }
  if (state.isRecaptchaFrame) {
    handleRecaptcha();
  }
}
