export function getAddonAccess(core) {
  return core.invokeCoreAction("addon.access", {});
}

export function getCoreThrottle(core) {
  return core.invokeCoreAction("addon.throttle", {});
}
