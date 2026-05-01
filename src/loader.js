// src/loader.js
import { debugLog } from "./core/logger";
import { safeExecute } from "./core/safeExecute.js";
import { registerFeature } from "./core/featureCatalog.js";
import { contributeToSection } from "./ui/settingsRuntime/sectionsRegistry.js";

// Features
import { dismissNotificationFeature } from "./features/dismiss-notification/index.js";
import { latestOverlayFeature } from "./features/latest-overlay/index.js";
import { wideLatestPageFeature, denseLatestGridFeature } from "./features/wide-latest/index.js";
import { latestControlFeature } from "./features/latest-control/index.js";
import { signatureCollapseFeature } from "./features/signature-collapse/index.js";
import { threadOverlayFeature } from "./features/thread-overlay/index.js";
import { wideForumFeature } from "./features/wideForum/index.js";

const featureRegistry = [
  wideLatestPageFeature,
  denseLatestGridFeature,
  latestOverlayFeature,
  latestControlFeature,
  threadOverlayFeature,
  wideForumFeature,
  signatureCollapseFeature,
  dismissNotificationFeature,
].map(registerFeature);

function registerFeatureSettingsUi(feature) {
  const settingsUi = feature?.settingsUi;
  if (!settingsUi || typeof settingsUi !== "object") return;

  const metaMaps = Array.isArray(settingsUi.metaMaps) ? settingsUi.metaMaps : [];
  if (metaMaps.length === 0) return;

  const sectionId = String(settingsUi.sectionId || "").trim();
  if (!sectionId) return;

  for (const metaMap of metaMaps) {
    contributeToSection(sectionId, metaMap);
  }
}

featureRegistry.forEach(registerFeatureSettingsUi);

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
  debugLog("Loader", "Running unified feature registry...");
  safeExecute(() => runFeatureRegistry(featureRegistry));
}
