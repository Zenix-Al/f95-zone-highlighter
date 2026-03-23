// src/loader.js
import stateManager from "./config.js";
import { debugLog } from "./core/logger";
import { safeExecute } from "./core/safeExecute.js";

// Features
import { dismissNotificationFeature } from "./features/dismiss-notification/index.js";
import { latestOverlayFeature } from "./features/latest-overlay/index.js";
import { wideLatestPageFeature, denseLatestGridFeature } from "./features/wide-latest/index.js";
import { latestControlFeature } from "./features/latest-control/index.js";
import { imageRepairFeature } from "./features/image-repair/index.js";
import { signatureCollapseFeature } from "./features/signature-collapse/index.js";
import { threadOverlayFeature } from "./features/thread-overlay/index.js";
import {
  maskedLinkHijackerFeature,
  recaptchaFrameFeature,
  maskedPageFeature,
} from "./features/masked-link-skipper/index.js";
import {
  directDownloadFeature,
  downloadPageFeature,
  directDownloadAutoRetryFeature,
} from "./features/direct-download/index.js";
import { wideForumFeature } from "./features/wideForum/index.js";

const featureRegistry = [
  wideLatestPageFeature,
  denseLatestGridFeature,
  latestOverlayFeature,
  latestControlFeature,
  threadOverlayFeature,
  wideForumFeature,
  imageRepairFeature,
  signatureCollapseFeature,
  maskedLinkHijackerFeature,
  directDownloadFeature,
  dismissNotificationFeature,
  downloadPageFeature,
  directDownloadAutoRetryFeature,
  recaptchaFrameFeature,
];

function runFeatureRegistry(features) {
  if (!Array.isArray(features) || features.length === 0) return;
  for (const feature of features) {
    safeExecute(() => {
      if (!feature || typeof feature !== "object") return;
      if (typeof feature.isEnabled !== "function" || typeof feature.enable !== "function") return;
      if (feature.isEnabled()) {
        feature.enable();
      }
    });
  }
}

export function loadFeatures() {
  if (stateManager.get("isMaskedLink")) {
    debugLog("Loader", "Masked page detected, running masked page feature only...");
    safeExecute(() => {
      if (maskedPageFeature.isEnabled()) maskedPageFeature.enable();
    });
    return;
  }

  debugLog("Loader", "Running unified feature registry...");
  safeExecute(() => runFeatureRegistry(featureRegistry));
}
