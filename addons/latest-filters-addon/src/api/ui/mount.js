export function mountUi(core, payload) {
  return core.invokeCoreAction("ui.mount", payload);
}

export function unmountUi(core, mountId) {
  return core.invokeCoreAction("ui.unmount", { mountId });
}
