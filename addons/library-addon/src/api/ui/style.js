export const registerStyle = (core, styleId, cssText) =>
  core.invokeCoreAction("ui.style.register", { styleId, cssText });
export const unregisterStyle = (core, styleId) =>
  core.invokeCoreAction("ui.style.unregister", { styleId });
