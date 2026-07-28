export function registerStyle(core, styleId, cssText) {
  return core.invokeCoreAction("ui.style.register", { styleId, cssText });
}

export function unregisterStyle(core, styleId) {
  return core.invokeCoreAction("ui.style.unregister", { styleId });
}
