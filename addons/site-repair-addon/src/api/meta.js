export function getAddonAccess(core) { return core.invokeCoreAction("addon.access", {}); }
export function getPageContext(core) { return core.invokeCoreAction("page.getContext", {}); }
