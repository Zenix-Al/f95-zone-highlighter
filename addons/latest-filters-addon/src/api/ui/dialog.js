import { invokeOptionalCoreAction } from "../../../../shared/apiFallback.js";

export function openDialog(core, payload) {
  return core.invokeCoreAction("ui.dialog.open", payload);
}

export function closeDialog(core, dialogId, reason = "") {
  return core.invokeCoreAction("ui.dialog.close", { dialogId, reason });
}

export function confirmDialog(core, payload) {
  return core.invokeCoreAction("ui.confirm", payload);
}

export function updateDialog(core, dialogId, html, fallback) {
  return invokeOptionalCoreAction(core, "ui.dialog.update", { dialogId, html }, fallback);
}
