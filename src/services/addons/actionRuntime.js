import { showToast } from "../../ui/components/toast.js";
import { openConfirmDialog } from "../../ui/components/dialog.js";
import { emitAddonCommand } from "./lifecycle.js";
import {
  idbBulkDeleteForAddon,
  idbBulkPutForAddon,
  idbCountForAddon,
  idbDeleteForAddon,
  idbGetForAddon,
  idbPutForAddon,
  idbQueryForAddon,
} from "./idbStore.js";
import { unwatchAddonObserver, watchAddonObserver } from "./observer.js";
import { updateAddonStatus } from "./registry.js";
import { addonLifecycle, cleanupAddonRuntimeResources } from "./runtimeLifecycle.js";
import {
  ensureAddonStateBucket,
  persistAddonsState,
  setAddonEnabledState,
  upsertInstalledAddonMeta,
} from "./state.js";
import {
  closeAddonDialog,
  mountAddonUi,
  openAddonDialog,
  registerAddonStyle,
  removeAddonDockButtons,
  sanitizeAddonDialogId,
  sanitizeAddonMountId,
  sanitizeAddonStyleId,
  sanitizeDockButtons,
  setAddonDockButtons,
  unmountAddonUi,
  unregisterAddonStyle,
  updateAddonDialog,
  updateAddonUi,
} from "./uiHost.js";
import { measurePayloadBytes } from "./apiPolicy.js";

const FAMILY_DEPS = Object.freeze({
  toast: Object.freeze({ showToast }),
  lifecycle: Object.freeze({
    updateAddonStatus,
    emitAddonLifecycleCommand: addonLifecycle.emitLifecycleCommand,
    ensureAddonStateBucket,
    persistAddonsState,
    upsertInstalledAddonMeta,
    cancelAddonTeardown: addonLifecycle.cancelTeardown,
    setAddonEnabledState,
    cleanupAddonRuntimeResources,
    emitAddonCommand,
  }),
  storage: Object.freeze({ measurePayloadBytes, ensureAddonStateBucket, persistAddonsState }),
  idb: Object.freeze({
    measurePayloadBytes,
    idbGetForAddon,
    idbPutForAddon,
    idbDeleteForAddon,
    idbBulkPutForAddon,
    idbBulkDeleteForAddon,
    idbQueryForAddon,
    idbCountForAddon,
  }),
  observer: Object.freeze({ watchAddonObserver, unwatchAddonObserver }),
  ui: Object.freeze({
    sanitizeDockButtons,
    setAddonDockButtons,
    removeAddonDockButtons,
    sanitizeAddonMountId,
    mountAddonUi,
    updateAddonUi,
    unmountAddonUi,
    sanitizeAddonDialogId,
    openAddonDialog,
    closeAddonDialog,
    updateAddonDialog,
    openConfirmDialog,
    sanitizeAddonStyleId,
    registerAddonStyle,
    unregisterAddonStyle,
  }),
  page: Object.freeze({}),
});

export function getAddonActionFamily(action) {
  if (action.startsWith("toast.")) return "toast";
  if (action.startsWith("feature.")) return "lifecycle";
  if (action.startsWith("storage.") || action.startsWith("config.")) return "storage";
  if (action.startsWith("idb.")) return "idb";
  if (action.startsWith("observer.")) return "observer";
  if (action.startsWith("ui.")) return "ui";
  if (action.startsWith("page.")) return "page";
  return "";
}

export function getAddonActionDependencies(action) {
  return FAMILY_DEPS[getAddonActionFamily(String(action || ""))] || Object.freeze({});
}

export function getAddonActionDependencySnapshot() {
  return Object.freeze(Object.fromEntries(
    Object.entries(FAMILY_DEPS).map(([family, deps]) => [family, Object.freeze(Object.keys(deps).sort())]),
  ));
}
