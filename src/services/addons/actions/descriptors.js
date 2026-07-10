import {
  actionConfigGetTagPrefs, actionFeatureEnableDisable, actionFeatureRefresh, actionIdbBulkDelete,
  actionIdbBulkPut, actionIdbCount, actionIdbDelete, actionIdbGet, actionIdbPut, actionIdbQuery,
  actionObserverUnwatch, actionObserverWatch, actionStorageGet, actionStorageGetUsage, actionStorageSet,
  actionToastShow, actionUiConfirm, actionUiDialogClose, actionUiDialogOpen, actionUiDockRemoveButtons,
  actionUiDockSetButtons, actionUiMount, actionUiStyleRegister, actionUiStyleUnregister, actionUiUnmount,
  actionUiUpdate,
} from "../coreActions.js";
import { registerAction } from "./registry.js";

const ACTIONS = Object.freeze({
  "toast.show": ["toast"], "feature.enable": ["feature"], "feature.disable": ["feature"], "feature.refresh": ["feature"],
  "storage.get": ["storage"], "storage.set": ["storage"], "storage.getUsage": ["storage"], "config.getTagPrefs": ["storage"],
  "idb.get": ["idb"], "idb.put": ["idb"], "idb.delete": ["idb"], "idb.bulkPut": ["idb"], "idb.bulkDelete": ["idb"], "idb.query": ["idb"], "idb.count": ["idb"],
  "observer.watch": ["observer"], "observer.unwatch": ["observer"],
  "ui.dock.setButtons": ["ui", "ui.dock"], "ui.dock.removeButtons": ["ui", "ui.dock"], "ui.mount": ["ui", "ui.mount"], "ui.update": ["ui", "ui.mount"], "ui.unmount": ["ui", "ui.mount"],
  "ui.dialog.open": ["ui", "ui.dialog"], "ui.dialog.close": ["ui", "ui.dialog"], "ui.confirm": ["ui", "ui.dialog"], "ui.style.register": ["ui", "ui.style"], "ui.style.unregister": ["ui", "ui.style"],
});

function objectPayload(payload) { return payload && typeof payload === "object" && !Array.isArray(payload) ? true : { ok: false, reason: "invalid_payload" }; }
function keyPayload(payload) { return objectPayload(payload); }
function valuePayload(payload) { return objectPayload(payload); }
const validators = Object.freeze({
  "storage.get": keyPayload, "storage.set": valuePayload, "idb.get": keyPayload, "idb.put": valuePayload, "idb.delete": keyPayload,
  "idb.bulkPut": objectPayload, "idb.bulkDelete": objectPayload, "idb.query": objectPayload, "idb.count": objectPayload,
  "observer.watch": objectPayload, "observer.unwatch": objectPayload, "ui.dock.setButtons": objectPayload, "ui.mount": objectPayload,
  "ui.update": objectPayload, "ui.unmount": objectPayload, "ui.dialog.open": objectPayload, "ui.dialog.close": objectPayload,
  "ui.confirm": objectPayload, "ui.style.register": objectPayload, "ui.style.unregister": objectPayload, "toast.show": objectPayload,
});

function executeLegacyHandler(id, { addonId, payload, deps, limits }) {
  const h = {
    "toast.show": () => actionToastShow(deps.showToast, payload),
    "feature.enable": () => actionFeatureEnableDisable(addonId, id, deps.updateAddonStatus, deps.emitAddonLifecycleCommand, deps.ensureAddonStateBucket, deps.persistAddonsState, deps.upsertInstalledAddonMeta, deps.requestAddonTeardown, deps.cancelAddonTeardown),
    "feature.disable": () => actionFeatureEnableDisable(addonId, id, deps.updateAddonStatus, deps.emitAddonLifecycleCommand, deps.ensureAddonStateBucket, deps.persistAddonsState, deps.upsertInstalledAddonMeta, deps.requestAddonTeardown, deps.cancelAddonTeardown),
    "feature.refresh": () => actionFeatureRefresh(addonId, deps.emitAddonCommand),
    "storage.get": () => actionStorageGet(addonId, payload, deps.ensureAddonStateBucket, deps.persistAddonsState),
    "storage.set": () => actionStorageSet(addonId, payload, deps.measurePayloadBytes, limits.maxAddonStorageValueBytes, limits.maxAddonStorageTotalBytes, deps.ensureAddonStateBucket, deps.persistAddonsState),
    "storage.getUsage": () => actionStorageGetUsage(addonId, deps.measurePayloadBytes, limits.maxAddonStorageValueBytes, limits.maxAddonStorageTotalBytes, deps.ensureAddonStateBucket),
    "config.getTagPrefs": () => actionConfigGetTagPrefs(deps.measurePayloadBytes, limits.maxAddonStorageValueBytes),
    "idb.get": () => actionIdbGet(addonId, payload, deps.measurePayloadBytes, limits.maxAddonIdbPayloadBytes, deps.idbGetForAddon),
    "idb.put": () => actionIdbPut(addonId, payload, deps.measurePayloadBytes, limits.maxAddonIdbPayloadBytes, deps.idbPutForAddon),
    "idb.delete": () => actionIdbDelete(addonId, payload, deps.measurePayloadBytes, limits.maxAddonIdbPayloadBytes, deps.idbDeleteForAddon),
    "idb.bulkPut": () => actionIdbBulkPut(addonId, payload, deps.measurePayloadBytes, limits.maxAddonIdbPayloadBytes, limits.maxAddonIdbBulkItems, deps.idbBulkPutForAddon),
    "idb.bulkDelete": () => actionIdbBulkDelete(addonId, payload, deps.measurePayloadBytes, limits.maxAddonIdbPayloadBytes, limits.maxAddonIdbBulkItems, deps.idbBulkDeleteForAddon),
    "idb.query": () => actionIdbQuery(addonId, payload, deps.measurePayloadBytes, limits.maxAddonIdbPayloadBytes, deps.idbQueryForAddon),
    "idb.count": () => actionIdbCount(addonId, payload, deps.measurePayloadBytes, limits.maxAddonIdbPayloadBytes, deps.idbCountForAddon),
    "observer.watch": () => actionObserverWatch(addonId, payload, deps.watchAddonObserver), "observer.unwatch": () => actionObserverUnwatch(addonId, payload, deps.unwatchAddonObserver),
    "ui.dock.setButtons": () => actionUiDockSetButtons(addonId, payload, deps.sanitizeDockButtons, deps.setAddonDockButtons), "ui.dock.removeButtons": () => actionUiDockRemoveButtons(addonId, deps.removeAddonDockButtons),
    "ui.mount": () => actionUiMount(addonId, payload, limits.maxAddonUiHtmlBytes, deps.sanitizeAddonMountId, deps.mountAddonUi), "ui.update": () => actionUiUpdate(addonId, payload, limits.maxAddonUiHtmlBytes, deps.sanitizeAddonMountId, deps.updateAddonUi), "ui.unmount": () => actionUiUnmount(addonId, payload, deps.unmountAddonUi),
    "ui.dialog.open": () => actionUiDialogOpen(addonId, payload, limits.maxAddonUiHtmlBytes, deps.sanitizeAddonDialogId, deps.openAddonDialog), "ui.dialog.close": () => actionUiDialogClose(addonId, payload, deps.closeAddonDialog), "ui.confirm": () => actionUiConfirm(payload, deps.openConfirmDialog),
    "ui.style.register": () => actionUiStyleRegister(addonId, payload, limits.maxAddonStyleTextBytes, deps.sanitizeAddonStyleId, deps.registerAddonStyle), "ui.style.unregister": () => actionUiStyleUnregister(addonId, payload, deps.unregisterAddonStyle),
  }[id];
  return h ? h() : { ok: false, reason: "unsupported_action" };
}

for (const [id, requiredCapabilities] of Object.entries(ACTIONS)) {
  registerAction({
    id,
    protocolVersion: 1,
    requiredCapabilities,
    validatePayload: validators[id] || objectPayload,
    timeoutMs: 5_000,
    auditCategory: id.split(".")[0],
    execute: (context) => executeLegacyHandler(id, context),
    redactResult: (result) => result && typeof result === "object" ? result : { ok: false, reason: "invalid_action_result" },
  });
}
