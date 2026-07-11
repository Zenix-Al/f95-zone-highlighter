// src/loader.js
import { debugLog } from "./core/logger";
import {
  listFeaturesByBootstrapMode,
  listRegisteredFeatures,
  registerFeature,
} from "./core/featureCatalog.js";
import { runFrameBudgeted } from "./core/frameBudget.js";
import { getFeatureStatus, reportFeatureFailure } from "./core/featureHealth.js";
import {
  refreshFastCaptureFeatures,
  registerFastCaptureFeatures,
} from "./services/fastCapture/index.js";
import { TIMINGS } from "./config/timings.js";
import { contributeToSection } from "./ui/settingsRuntime/sectionsRegistry.js";
import { generatedFeatures } from "./generated/features.generated.js";
import { featureMatchesPageScopes } from "./core/featureScope.js";
import { getRouteContext, isRouteContextCurrent } from "./core/routeState.js";

const featureRegistry = generatedFeatures.map(registerFeature);

function registerFeatureSettingsUi(feature) {
  const settingsUi = feature?.settingsUi;
  if (!settingsUi || typeof settingsUi !== "object") return;

  const metaMaps = Array.isArray(settingsUi.metaMaps) ? settingsUi.metaMaps : [];
  if (metaMaps.length === 0) return;

  const sectionId = String(settingsUi.sectionId || "").trim();
  if (!sectionId) return;

  const ownerId = `feature:${String(feature.featureKey || feature.id || feature.name || "unknown").trim()}`;
  for (const metaMap of metaMaps) {
    contributeToSection(sectionId, metaMap, ownerId);
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

async function runFeatureRegistry(features, routeContext = null) {
  if (!Array.isArray(features) || features.length === 0) return;
  const work = [];
  const activeRoute = routeContext || getRouteContext();
  await runFrameBudgeted(features, (feature) => {
      try {
        if (!feature || typeof feature !== "object") return;
        if (typeof feature.isEnabled !== "function" || typeof feature.enable !== "function") return;
        if (isFeatureAllowedOnCurrentPage(feature) && feature.isEnabled()) {
          work.push(feature.enable({ ...activeRoute, routeGeneration: activeRoute.generation }));
        }
      } catch (error) {
        reportFeatureFailure(feature?.name || "Feature Loader", error, "loader.enable");
        console.error(`[Loader] Failed to enable ${feature?.name || "feature"}:`, error);
      }
    }, {
      budgetMs: TIMINGS.LOADER_FEATURE_FRAME_BUDGET_MS,
      minChunk: TIMINGS.LOADER_FEATURE_MIN_CHUNK,
      startOnNextFrame: false,
      shouldContinue: () => activeRoute.generation === 0 || isRouteContextCurrent(activeRoute),
    });
  await Promise.all(work);
}

export function loadFastBootstrapFeatures(routeContext = null) {
  const features = getFastBootstrapFeatures();
  debugLog("Loader", `Registering ${features.length} fast bootstrap feature(s)...`);
  return registerFastCaptureFeatures(features, routeContext);
}

export function refreshFastBootstrapFeatures(routeContext = null) {
  return refreshFastCaptureFeatures(getFastBootstrapFeatures(), routeContext);
}

export async function loadBodyBootstrapFeatures(routeContext = null) {
  const features = getBodyBootstrapFeatures();
  debugLog("Loader", `Running ${features.length} body bootstrap feature(s)...`);
  await runFeatureRegistry(features, routeContext);
}

export async function loadFeatures() {
  await loadBodyBootstrapFeatures();
}

export async function reconcileFeatures(routeContext = null) {
  const activeRoute = routeContext || getRouteContext();
  if (activeRoute.generation > 0 && !isRouteContextCurrent(activeRoute)) return { status: "stale", transitions: 0 };
  const transitions = [];
  const orderedFeatures = [
    ...listFeaturesByBootstrapMode("fast"),
    ...listFeaturesByBootstrapMode("waitForBody"),
  ];
  for (const feature of orderedFeatures) {
    if (!feature || typeof feature.isEnabled !== "function") continue;
    const shouldRun = isFeatureAllowedOnCurrentPage(feature) && feature.isEnabled();
    const status = getFeatureStatus(feature.name).status;
    if (shouldRun && status !== "running" && typeof feature.enable === "function") {
      transitions.push(feature.enable({ ...activeRoute, routeGeneration: activeRoute.generation, reason: "route-change" }));
    } else if (!shouldRun && status !== "disabled" && typeof feature.disable === "function") {
      transitions.push(feature.disable({ ...activeRoute, routeGeneration: activeRoute.generation, reason: "route-change" }));
    }
  }
  await Promise.all(transitions);
  if (activeRoute.generation > 0 && !isRouteContextCurrent(activeRoute)) return { status: "stale", transitions: transitions.length };
  return { status: "completed", transitions: transitions.length };
}
