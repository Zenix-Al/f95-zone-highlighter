// src/loader.js
import stateManager, { config } from "./config.js";
import { debugLog } from "./core/logger";
import { safeExecute } from "./core/safeExecute.js";

// Features
import { executeAutoRetry } from "./features/direct-download/autoRetryDownload.js";
import { dismissNotificationFeature } from "./features/dismiss-notification/index.js";
import { latestOverlayFeature } from "./features/latest-overlay/index.js";
import { wideLatestPageFeature, denseLatestGridFeature } from "./features/wide-latest/index.js";
import { latestControlFeature } from "./features/latest-control/index.js";
import { imageRepairFeature } from "./features/image-repair/index.js";
import { signatureCollapseFeature } from "./features/signature-collapse/index.js";
import { threadOverlayFeature } from "./features/thread-overlay/index.js";
import { maskedLinkHijackerFeature, handleRecaptcha } from "./features/masked-link-skipper/index.js";
import { handleDownload } from "./features/direct-download/fileHostHelper.js";
import { directDownloadFeature } from "./features/direct-download/index.js";
import { wideForumFeature } from "./features/wideForum/index.js";

const latestPageFeaturesMap = [
  { feature: wideLatestPageFeature },
  { feature: denseLatestGridFeature },
  { feature: latestOverlayFeature },
  { feature: latestControlFeature },
];

const threadPageFeaturesMap = [
  { feature: threadOverlayFeature },
  { feature: wideForumFeature },
  { feature: imageRepairFeature },
  { feature: signatureCollapseFeature },
  { feature: maskedLinkHijackerFeature },
  { feature: directDownloadFeature },
];

const globalFeaturesMap = [
  { feature: dismissNotificationFeature },
];

function runFeaturesFromMap(features, settings) {
  for (const feature of features) {
    if (feature.feature) { // New standardized feature object
        if (feature.feature.isEnabled()) {
            safeExecute(() => feature.feature.enable());
        }
        continue;
    }

    // Legacy feature loading
    let shouldRun = false;
    if (Array.isArray(feature.configKey)) {
      const operator = feature.operator || "AND"; // Default to AND
      if (operator === "OR") {
        shouldRun = feature.configKey.some((key) => settings[key]);
      } else {
        shouldRun = feature.configKey.every((key) => settings[key]);
      }
    } else {
      shouldRun = !!settings[feature.configKey];
    }

    if (shouldRun) {
      safeExecute(feature.handler);
    }
  }
}

function loadLatestPageFeatures() {
  debugLog("Loader", "Latest page features loading...");
  runFeaturesFromMap(latestPageFeaturesMap, config.latestSettings);
}

function loadThreadPageFeatures() {
  debugLog("Loader", "Thread page features loading...");
  runFeaturesFromMap(threadPageFeaturesMap, config.threadSettings);
}

function loadDownloadPageFeatures() {
  const downloadPageHost = stateManager.get('isDownloadPage');
  if (downloadPageHost) {
    debugLog("Init", `Download page detected: ${downloadPageHost}`);
    handleDownload(downloadPageHost);
  }
}

export function loadFeatures() {
  if (stateManager.get('isLatest')) {
    loadLatestPageFeatures();
  }
  if (stateManager.get('isThread')) {
    loadThreadPageFeatures();
  }
  if (stateManager.get('isDownloadPage')) {
    loadDownloadPageFeatures();
  }
  const directDownloadHost = stateManager.get('isDirectDownloadPage');
  if (directDownloadHost) {
    executeAutoRetry(directDownloadHost);
  }
  if (stateManager.get('isF95Zone')) {
    runFeaturesFromMap(globalFeaturesMap, config.globalSettings);
  }
  if (stateManager.get('isRecaptchaFrame')) {
    handleRecaptcha();
  }
}
