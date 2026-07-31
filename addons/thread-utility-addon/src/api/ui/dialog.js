import { byteLength, THREAD_UTILITY_LIMITS } from "../../domain/limits.js";

function validHtml(html) {
  const value = String(html || "");
  return value && byteLength(value) <= THREAD_UTILITY_LIMITS.dialogHtmlBytes
    ? value
    : "";
}

export function openDialog(core, payload) {
  const html = validHtml(payload?.html);
  if (!html) return Promise.resolve({ ok: false, reason: "dialog_html_too_large" });
  return core.invokeCoreAction("ui.dialog.open", { ...payload, html });
}

export function updateDialog(core, dialogId, html) {
  const safeHtml = validHtml(html);
  if (!safeHtml) return Promise.resolve({ ok: false, reason: "dialog_html_too_large" });
  return core.invokeCoreAction("ui.dialog.update", { dialogId, html: safeHtml });
}

export function closeDialog(core, dialogId, reason = "addon-request") {
  return core.invokeCoreAction("ui.dialog.close", { dialogId, reason });
}
