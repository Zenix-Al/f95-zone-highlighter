const _registeredFeatures = [];
const _registeredFeatureKeys = new Set();
const _featureBuckets = {
  fast: [],
  waitForBody: [],
};

function getFeatureKey(feature) {
  return String(feature?.featureKey || feature?.id || feature?.name || "").trim();
}

function getBucketName(feature) {
  return feature?.bootstrapMode === "fast" ? "fast" : "waitForBody";
}

export function registerFeature(feature) {
  if (!feature || typeof feature !== "object") return feature;
  const key = getFeatureKey(feature);
  if (key && _registeredFeatureKeys.has(key)) return feature;
  _registeredFeatures.push(feature);
  if (key) _registeredFeatureKeys.add(key);
  _featureBuckets[getBucketName(feature)].push(feature);
  return feature;
}

export function listRegisteredFeatures() {
  return [..._registeredFeatures];
}

export function listFeaturesByBootstrapMode(mode) {
  const bucketName = mode === "fast" ? "fast" : "waitForBody";
  return [..._featureBuckets[bucketName]];
}

export function resetFeatureCatalogForTests() {
  _registeredFeatures.splice(0, _registeredFeatures.length);
  _registeredFeatureKeys.clear();
  _featureBuckets.fast.splice(0, _featureBuckets.fast.length);
  _featureBuckets.waitForBody.splice(0, _featureBuckets.waitForBody.length);
}
