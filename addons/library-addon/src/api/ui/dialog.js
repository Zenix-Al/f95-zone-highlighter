import { invokeOptionalCoreAction } from "../../../../shared/apiFallback.js";

export function updateDialog(core, dialogId, html, fallback) {
  return invokeOptionalCoreAction(core, "ui.dialog.update", { dialogId, html }, fallback);
}
