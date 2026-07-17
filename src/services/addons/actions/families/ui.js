import { ADDON_UI_SLOT_POLICY, normalizeAddonMountSlot } from "../../uiSanitizer.js";
import { defineAction } from "../contract.js";

export function actionUiDockSetButtons(addonId, payload, sanitizeDockButtons, setAddonDockButtons) {
  return { ok: true, value: setAddonDockButtons(addonId, sanitizeDockButtons(payload?.buttons)) };
}
export function actionUiDockRemoveButtons(addonId, removeAddonDockButtons) {
  removeAddonDockButtons(addonId); return { ok: true };
}
export function actionUiMount(addonId, payload, maxBytes, sanitizeId, mount, allowed = null) {
  const mountId = sanitizeId(payload?.mountId || payload?.id || "");
  const html = String(payload?.html || payload?.template || "");
  const slot = String(payload?.slot || "page.panel");
  const position = String(payload?.position || "append");
  if (!mountId) return { ok: false, reason: "mount_id_required" };
  if (!html.trim()) return { ok: false, reason: "html_required" };
  if (html.length > maxBytes) return { ok: false, reason: "payload_too_large" };
  const normalizedSlot = normalizeAddonMountSlot(slot);
  if (!normalizedSlot) return { ok: false, reason: "mount_slot_not_allowed" };
  const capability = ADDON_UI_SLOT_POLICY[normalizedSlot].capability;
  if (allowed instanceof Set && !allowed.has(capability) && !allowed.has("ui")) {
    return { ok: false, reason: "permission_denied" };
  }
  return mount(addonId, { mountId, html, slot: normalizedSlot, position });
}
export function actionUiUpdate(addonId, payload, maxBytes, sanitizeId, update) {
  const mountId = sanitizeId(payload?.mountId || payload?.id || "");
  const html = String(payload?.html || payload?.template || "");
  if (!mountId) return { ok: false, reason: "mount_id_required" };
  if (!html.trim()) return { ok: false, reason: "html_required" };
  if (html.length > maxBytes) return { ok: false, reason: "payload_too_large" };
  return update(addonId, { mountId, html });
}
export function actionUiUnmount(addonId, payload, unmount) {
  return unmount(addonId, String(payload?.mountId || payload?.id || ""));
}
export function actionUiDialogOpen(addonId, payload, maxBytes, sanitizeId, open) {
  const dialogId = sanitizeId(payload?.dialogId || payload?.id || "");
  const html = String(payload?.html || payload?.template || "");
  if (!dialogId) return { ok: false, reason: "dialog_id_required" };
  if (!html.trim()) return { ok: false, reason: "html_required" };
  if (html.length > maxBytes) return { ok: false, reason: "payload_too_large" };
  return open(addonId, { ...payload, dialogId, html });
}
export function actionUiDialogClose(addonId, payload, close) {
  return close(addonId, String(payload?.dialogId || payload?.id || ""), String(payload?.reason || "addon-request"));
}
export function actionUiDialogUpdate(addonId, payload, maxBytes, sanitizeId, update) {
  const dialogId = sanitizeId(payload?.dialogId || payload?.id || "");
  const html = String(payload?.html || payload?.template || "");
  if (!dialogId) return { ok: false, reason: "dialog_id_required" };
  if (!html.trim()) return { ok: false, reason: "html_required" };
  if (html.length > maxBytes) return { ok: false, reason: "payload_too_large" };
  return update(addonId, { dialogId, html });
}
export async function actionUiConfirm(payload, openConfirmDialog) {
  if (typeof openConfirmDialog !== "function") return { ok: false, reason: "unsupported_action" };
  const confirmed = await openConfirmDialog({
    title: String(payload?.title || "Confirm"),
    description: String(payload?.description || payload?.message || "Are you sure?"),
    confirmLabel: String(payload?.confirmLabel || "Confirm"),
    cancelLabel: String(payload?.cancelLabel || "Cancel"),
  });
  return { ok: true, value: { confirmed: Boolean(confirmed) } };
}
export function actionUiStyleRegister(addonId, payload, maxBytes, sanitizeId, register) {
  const styleId = sanitizeId(payload?.styleId || payload?.id || "");
  const cssText = String(payload?.cssText || payload?.css || "");
  if (!styleId) return { ok: false, reason: "style_id_required" };
  if (!cssText.trim()) return { ok: false, reason: "css_required" };
  if (cssText.length > maxBytes) return { ok: false, reason: "payload_too_large" };
  return register(addonId, { styleId, cssText });
}
export function actionUiStyleUnregister(addonId, payload, unregister) {
  return unregister(addonId, String(payload?.styleId || payload?.id || ""));
}

const ui = (id, capabilities, execute, extension = {}) => defineAction({
  id, requiredCapabilities: capabilities, execute, ...extension,
});
const caps = (name) => ["ui", `ui.${name}`];

export const uiActions = Object.freeze([
  ui("ui.dock.setButtons", caps("dock"), ({ addonId, payload, deps }) => actionUiDockSetButtons(addonId, payload, deps.sanitizeDockButtons, deps.setAddonDockButtons)),
  ui("ui.dock.removeButtons", caps("dock"), ({ addonId, deps }) => actionUiDockRemoveButtons(addonId, deps.removeAddonDockButtons)),
  ui("ui.mount", caps("mount"), ({ addonId, payload, deps, limits, allowed }) => actionUiMount(addonId, payload, limits.maxAddonUiHtmlBytes, deps.sanitizeAddonMountId, deps.mountAddonUi, allowed)),
  ui("ui.update", caps("mount"), ({ addonId, payload, deps, limits }) => actionUiUpdate(addonId, payload, limits.maxAddonUiHtmlBytes, deps.sanitizeAddonMountId, deps.updateAddonUi)),
  ui("ui.unmount", caps("mount"), ({ addonId, payload, deps }) => actionUiUnmount(addonId, payload, deps.unmountAddonUi)),
  ui("ui.dialog.open", caps("dialog"), ({ addonId, payload, deps, limits }) => actionUiDialogOpen(addonId, payload, limits.maxAddonUiHtmlBytes, deps.sanitizeAddonDialogId, deps.openAddonDialog)),
  ui("ui.dialog.close", caps("dialog"), ({ addonId, payload, deps }) => actionUiDialogClose(addonId, payload, deps.closeAddonDialog)),
  ui("ui.dialog.update", caps("dialog"), ({ addonId, payload, deps, limits }) => actionUiDialogUpdate(addonId, payload, limits.maxAddonUiHtmlBytes, deps.sanitizeAddonDialogId, deps.updateAddonDialog), {
    ownership: "addon-owned dialog content",
    cleanup: "dialog teardown removes the owned entry; update fails after ownership ends",
  }),
  ui("ui.confirm", caps("dialog"), ({ payload, deps }) => actionUiConfirm(payload, deps.openConfirmDialog)),
  ui("ui.style.register", caps("style"), ({ addonId, payload, deps, limits }) => actionUiStyleRegister(addonId, payload, limits.maxAddonStyleTextBytes, deps.sanitizeAddonStyleId, deps.registerAddonStyle)),
  ui("ui.style.unregister", caps("style"), ({ addonId, payload, deps }) => actionUiStyleUnregister(addonId, payload, deps.unregisterAddonStyle)),
]);
