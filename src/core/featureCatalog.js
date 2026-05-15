const _registeredFeatures = [];

export function registerFeature(feature) {
  if (!feature || typeof feature !== "object") return feature;
  if (_registeredFeatures.includes(feature)) return feature;
  _registeredFeatures.push(feature);
  return feature;
}

export function listRegisteredFeatures() {
  return [..._registeredFeatures];
}

