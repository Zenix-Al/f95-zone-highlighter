import { invokeOptionalCoreAction } from "../../../../shared/apiFallback.js";

export function updateDialog(core, dialogId, html, fallback) {
  return invokeOptionalCoreAction(core, "ui.dialog.update", { dialogId, html }, fallback);
}

export function openDialog(core, payload) {
  return core.invokeCoreAction("ui.dialog.open", payload);
}

export function closeDialog(core, dialogId, reason = "addon-close") {
  return core.invokeCoreAction("ui.dialog.close", { dialogId, reason });
}
