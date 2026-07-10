import { pageDefinitions } from "../config/pageDefinitions.js";
import { reportFeatureFailure } from "./featureHealth.js";

const SUPPORTED_BOOTSTRAP_MODES = new Set(["fast", "waitForBody"]);
const registeredFeatures = [];
const registeredFeatureKeys = new Set();
const registeredFeatureIds = new Set();
const settingsContributionIds = new Set();
const featureBuckets = { fast: [], waitForBody: [] };

function isStrictRegistration() {
  return Boolean(globalThis.process) && globalThis.process.env?.NODE_ENV !== "production";
}

function getFeatureKey(feature) {
  return String(feature?.featureKey || feature?.id || feature?.name || "").trim();
}

function getSettingsContributionIds(feature) {
  const sectionId = String(feature?.settingsUi?.sectionId || "").trim();
  const maps = Array.isArray(feature?.settingsUi?.metaMaps) ? feature.settingsUi.metaMaps : [];
  return maps.flatMap((map) => Object.keys(map || {}).map((key) => `${sectionId}:${key}`));
}

/**
 * Validate the runtime descriptor before it enters a bootstrap bucket.  The
 * factory preserves the originally declared bootstrap value on
 * _declaredBootstrapMode so invalid declarations cannot be normalized away.
 */
export function validateFeatureDescriptor(feature, {
  featureKeys = registeredFeatureKeys,
  featureIds = registeredFeatureIds,
  contributionIds = settingsContributionIds,
} = {}) {
  const errors = [];
  if (!feature || typeof feature !== "object") return ["feature descriptor must be an object"];

  const id = String(feature.id || "").trim();
  const key = getFeatureKey(feature);
  if (!id) errors.push("feature id must be a non-empty stable string");
  if (!key) errors.push("feature catalog key must be a non-empty string");
  if (id && featureIds.has(id)) errors.push(`duplicate feature id '${id}'`);
  if (key && featureKeys.has(key)) errors.push(`duplicate feature catalog key '${key}'`);

  const declaredMode = feature._declaredBootstrapMode ?? feature.bootstrapMode;
  if (!SUPPORTED_BOOTSTRAP_MODES.has(declaredMode)) {
    errors.push(`invalid bootstrap mode '${String(declaredMode)}'`);
  }
  if (!Array.isArray(feature.pageScopes)) {
    errors.push("pageScopes must be an array when provided");
  } else {
    for (const scope of feature.pageScopes) {
      if (!Object.hasOwn(pageDefinitions, scope)) errors.push(`unknown page scope '${scope}'`);
    }
  }
  for (const handlerName of ["enable", "disable", "toggle", "sync", "isEnabled", "isApplicable"]) {
    if (handlerName in feature && typeof feature[handlerName] !== "function") {
      errors.push(`${handlerName} must be a function when provided`);
    }
  }
  for (const contributionId of getSettingsContributionIds(feature)) {
    if (contributionIds.has(contributionId)) errors.push(`duplicate settings contribution '${contributionId}'`);
  }
  return errors;
}

export function registerFeature(feature) {
  const errors = validateFeatureDescriptor(feature);
  if (errors.length) {
    const message = `Feature registration rejected: ${errors.join("; ")}`;
    if (isStrictRegistration()) throw new Error(message);
    reportFeatureFailure("Feature Catalog", message, "registration");
    return null;
  }

  const key = getFeatureKey(feature);
  const id = String(feature.id).trim();
  registeredFeatures.push(feature);
  registeredFeatureKeys.add(key);
  registeredFeatureIds.add(id);
  for (const contributionId of getSettingsContributionIds(feature)) settingsContributionIds.add(contributionId);
  featureBuckets[feature.bootstrapMode].push(feature);
  return feature;
}

export function listRegisteredFeatures() {
  return [...registeredFeatures];
}

export function listFeaturesByBootstrapMode(mode) {
  return [...(featureBuckets[mode] || [])];
}

export function resetFeatureCatalogForTests() {
  registeredFeatures.splice(0, registeredFeatures.length);
  registeredFeatureKeys.clear();
  registeredFeatureIds.clear();
  settingsContributionIds.clear();
  featureBuckets.fast.splice(0, featureBuckets.fast.length);
  featureBuckets.waitForBody.splice(0, featureBuckets.waitForBody.length);
}
