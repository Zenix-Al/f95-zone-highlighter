export function openDialog(core, payload) {
  return core.invokeCoreAction("ui.dialog.open", payload || {});
}

export function updateDialog(core, dialogId, html) {
  return core.invokeCoreAction("ui.dialog.update", { dialogId, html });
}

export function closeDialog(core, dialogId, reason = "addon-request") {
  return core.invokeCoreAction("ui.dialog.close", { dialogId, reason });
}
