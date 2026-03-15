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
  if (!Array.isArray(features) || features.length === 0) return;
  const safeSettings = settings && typeof settings === "object" ? settings : {};
  for (const entry of features) {
    safeExecute(() => {
      if (!entry || typeof entry !== "object") return;

      if (entry.feature) {
        const standardizedFeature = entry.feature;
        if (
          !standardizedFeature ||
          typeof standardizedFeature.isEnabled !== "function" ||
          typeof standardizedFeature.enable !== "function"
        ) {
          return;
        }
        if (standardizedFeature.isEnabled()) {
          standardizedFeature.enable();
        }
        return;
      }

      // Legacy feature loading
      let shouldRun = false;
      if (Array.isArray(entry.configKey)) {
        const operator = entry.operator || "AND"; // Default to AND
        if (operator === "OR") {
          shouldRun = entry.configKey.some((key) => safeSettings[key]);
        } else {
          shouldRun = entry.configKey.every((key) => safeSettings[key]);
        }
      } else {
        shouldRun = !!safeSettings[entry.configKey];
      }

      if (shouldRun && typeof entry.handler === "function") {
        entry.handler();
      }
    });
  }
}

function loadLatestPageFeatures() {
  debugLog("Loader", "Latest page features loading...");
  safeExecute(() => runFeaturesFromMap(latestPageFeaturesMap, config.latestSettings));
}

function loadThreadPageFeatures() {
  debugLog("Loader", "Thread page features loading...");
  safeExecute(() => runFeaturesFromMap(threadPageFeaturesMap, config.threadSettings));
}

function loadDownloadPageFeatures() {
  const downloadPageHost = stateManager.get("isDownloadPage");
  if (downloadPageHost) {
    debugLog("Init", `Download page detected: ${downloadPageHost}`);
    safeExecute(() => handleDownload(downloadPageHost));
  }
}

export function loadFeatures() {
  if (stateManager.get("isLatest")) {
    safeExecute(loadLatestPageFeatures);
  }
  if (stateManager.get("isThread")) {
    safeExecute(loadThreadPageFeatures);
  }
  if (stateManager.get("isDownloadPage")) {
    safeExecute(loadDownloadPageFeatures);
  }
  const directDownloadHost = stateManager.get("isDirectDownloadPage");
  if (directDownloadHost) {
    safeExecute(() => executeAutoRetry(directDownloadHost));
  }
  if (stateManager.get("isF95Zone")) {
    safeExecute(() => runFeaturesFromMap(globalFeaturesMap, config.globalSettings));
  }
  if (stateManager.get("isRecaptchaFrame")) {
    safeExecute(handleRecaptcha);
  }
}
