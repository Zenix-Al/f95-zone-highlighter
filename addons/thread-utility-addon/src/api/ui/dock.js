export function setDockButtons(core, buttons) {
  return core.invokeCoreAction("ui.dock.setButtons", { buttons });
}

export function removeDockButtons(core) {
  return core.invokeCoreAction("ui.dock.removeButtons", {});
}
