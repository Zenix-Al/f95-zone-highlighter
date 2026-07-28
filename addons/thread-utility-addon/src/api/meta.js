export function getAddonAccess(core) {
  return core.invokeCoreAction("addon.access", {});
}
