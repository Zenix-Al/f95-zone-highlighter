export const mountUi = (core, payload) => core.invokeCoreAction("ui.mount", payload);
export const unmountUi = (core, mountId) =>
  core.invokeCoreAction("ui.unmount", { mountId });
