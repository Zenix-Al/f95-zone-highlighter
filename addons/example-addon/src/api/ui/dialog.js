export function openDialog(core, payload) {
  return core.invokeCoreAction("ui.dialog.open", payload || {});
}

export function closeDialog(core, dialogId, reason = "addon-request") {
  return core.invokeCoreAction("ui.dialog.close", {
    dialogId,
    reason,
  });
}

export function confirmDialog(core, payload) {
  return core.invokeCoreAction("ui.confirm", payload || {});
}
