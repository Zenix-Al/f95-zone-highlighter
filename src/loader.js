// src/loader.js
import { debugLog } from "./core/logger";
import {
  listFeaturesByBootstrapMode,
  listRegisteredFeatures,
  registerFeature,
} from "./core/featureCatalog.js";
import { runFrameBudgeted } from "./core/frameBudget.js";
import { reportFeatureFailure } from "./core/featureHealth.js";
import {
  refreshFastCaptureFeatures,
  registerFastCaptureFeatures,
} from "./core/fastCaptureAdapter.js";
import { TIMINGS } from "./config/timings.js";
import { contributeToSection } from "./ui/settingsRuntime/sectionsRegistry.js";
import { generatedFeatures } from "./generated/features.generated.js";
import { featureMatchesPageScopes } from "./core/featureScope.js";

const featureRegistry = generatedFeatures.map(registerFeature);

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

export function isFeatureAllowedOnCurrentPage(feature) {
  return featureMatchesPageScopes(feature);
}

function getFastBootstrapFeatures() {
  return listFeaturesByBootstrapMode("fast").filter(isFeatureAllowedOnCurrentPage);
}

function getBodyBootstrapFeatures() {
  // Fast bootstrap only registers early capture rules. The feature lifecycle
  // still runs after body is ready so DOM observers/subscriptions can start.
  return listRegisteredFeatures();
}

async function runFeatureRegistry(features) {
  if (!Array.isArray(features) || features.length === 0) return;
  await runFrameBudgeted(
    features,
    (feature) => {
      try {
        if (!feature || typeof feature !== "object") return;
        if (typeof feature.isEnabled !== "function" || typeof feature.enable !== "function") return;
        if (isFeatureAllowedOnCurrentPage(feature) && feature.isEnabled()) {
          feature.enable();
        }
      } catch (error) {
        reportFeatureFailure(feature?.name || "Feature Loader", error, "loader.enable");
        console.error(`[Loader] Failed to enable ${feature?.name || "feature"}:`, error);
      }
    },
    {
      budgetMs: TIMINGS.LOADER_FEATURE_FRAME_BUDGET_MS,
      minChunk: TIMINGS.LOADER_FEATURE_MIN_CHUNK,
      startOnNextFrame: false,
    },
  );
}

export function loadFastBootstrapFeatures() {
  const features = getFastBootstrapFeatures();
  debugLog("Loader", `Registering ${features.length} fast bootstrap feature(s)...`);
  return registerFastCaptureFeatures(features);
}

export function refreshFastBootstrapFeatures() {
  return refreshFastCaptureFeatures(getFastBootstrapFeatures());
}

export async function loadBodyBootstrapFeatures() {
  const features = getBodyBootstrapFeatures();
  debugLog("Loader", `Running ${features.length} body bootstrap feature(s)...`);
  await runFeatureRegistry(features);
}

export async function loadFeatures() {
  await loadBodyBootstrapFeatures();
}
