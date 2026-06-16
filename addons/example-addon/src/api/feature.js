export function enableFeature(core) {
  return core.invokeCoreAction("feature.enable", {});
}

export function disableFeature(core) {
  return core.invokeCoreAction("feature.disable", {});
}

export function refreshFeature(core) {
  return core.invokeCoreAction("feature.refresh", {});
}
