import stateManager from "../config.js";
import { showToast } from "../ui/components/toast.js";
import { openConfirmDialog } from "../ui/components/dialog.js";
import {
  ADDON_COMMAND_EVENT,
  ADDONS_API_VERSION,
  ADDONS_DEV_BRIDGE_MARKER,
  ADDONS_DEV_COMMAND_EVENT,
  sanitizeAddonId,
} from "./addons/shared.js";
import {
  listRegisteredAddons,
  registerAddon,
  reapplyAddonSecurityPolicies,
  replaceRegisteredAddons,
  subscribeAddonsRegistry,
  unregisterAddon as unregisterAddonFromRegistry,
  updateAddonStatus,
} from "./addons/registry.js";
import {
  clearAddonState,
  ensureAddonStateBucket,
  getAddonState,
  listInstalledAddonMeta,
  persistAddonsState,
  removeInstalledAddonMeta,
  setAddonStateValue,
  upsertInstalledAddonMeta,
} from "./addons/state.js";
import { isCatalogFresh, listTrustedAddonCatalog } from "./addons/catalog.js";
import {
  cleanupAddonObserverSubscriptions,
  unwatchAddonObserver,
  watchAddonObserver,
} from "./addons/observer.js";
import { initAddonsBridgeServer } from "./addons/bridgeServer.js";
import { createAddonLifecycleOrchestrator, emitAddonCommand } from "./addons/lifecycle.js";
import { invokeRegisteredAddonCoreAction, isAddonActionAllowed } from "./addons/coreActions.js";
import { buildKnownAddonsSnapshot } from "./addons/knownAddons.js";
import {
  cleanupAddonUi,
  closeAddonDialog,
  mountAddonUi,
  openAddonDialog,
  registerAddonStyle,
  removeAddonDockButtons,
  sanitizeAddonDialogId,
  sanitizeDockButtons,
  sanitizeAddonMountId,
  sanitizeAddonStyleId,
  setAddonDockButtons,
  unmountAddonUi,
  unregisterAddonStyle,
  updateAddonUi,
} from "./addons/uiHost.js";
import {
  idbBulkPutForAddon,
  idbCountForAddon,
  idbDeleteForAddon,
  idbGetForAddon,
  idbPutForAddon,
  idbQueryForAddon,
} from "./addons/idbStore.js";

const MAX_ADDON_IDB_PAYLOAD_BYTES = 512 * 1024;
const MAX_ADDON_IDB_BULK_ITEMS = 500;
const MAX_ADDON_STYLE_TEXT_BYTES = 64 * 1024;
const MAX_ADDON_UI_HTML_BYTES = 128 * 1024;
const MAX_ADDON_STORAGE_VALUE_BYTES = 16 * 1024;
const MAX_ADDON_STORAGE_TOTAL_BYTES = 64 * 1024;
const ADDON_TEARDOWN_WATCHDOG_MS = 1200;

export { listRegisteredAddons, replaceRegisteredAddons, registerAddon, subscribeAddonsRegistry };
export { getAddonState, setAddonStateValue, clearAddonState };
export { isCatalogFresh };
const addonLifecycle = createAddonLifecycleOrchestrator({
  sanitizeAddonId,
  listRegisteredAddons,
  cleanupAddonObserverSubscriptions,
  cleanupAddonUi,
  teardownWatchdogMs: ADDON_TEARDOWN_WATCHDOG_MS,
  eventName: ADDON_COMMAND_EVENT,
});

export function notifyAllAddonsBeforePageChange() {
  addonLifecycle.notifyAllBeforePageChange();
}

function getCurrentPageScopes() {
  const scopes = [];
  if (stateManager.get("isThread")) scopes.push("thread");
  if (stateManager.get("isLatest")) scopes.push("latest");
  if (stateManager.get("isDownloadPage")) scopes.push("download");
  if (stateManager.get("isRecaptchaFrame")) scopes.push("recaptcha");
  return scopes;
}

export function listKnownAddons() {
  const registered = listRegisteredAddons();
  const catalog = listTrustedAddonCatalog();
  const installedMeta = listInstalledAddonMeta();
  const currentScopes = getCurrentPageScopes();
  const catalogFresh = isCatalogFresh();

  return buildKnownAddonsSnapshot({
    registered,
    catalog,
    installedMeta,
    currentScopes,
    catalogFresh,
    getAddonState,
  });
}

export function refreshAddonSecurityPolicies() {
  return reapplyAddonSecurityPolicies();
}

export async function removeAddonInstallationTrace(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return { ok: false, reason: "invalid_addon_id" };

  const metaRemoved = await removeInstalledAddonMeta(normalizedId);
  if (!metaRemoved.ok) return metaRemoved;

  const stateCleared = await clearAddonState(normalizedId);
  if (!stateCleared.ok) return stateCleared;

  return { ok: true };
}

export function unregisterAddon(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return listRegisteredAddons();

  addonLifecycle.requestTeardown(normalizedId, "unregister");
  addonLifecycle.emitLifecycleCommand(normalizedId, "before-unregister");

  return unregisterAddonFromRegistry(normalizedId);
}

function measurePayloadBytes(payload) {
  try {
    return JSON.stringify(payload || null).length;
  } catch {
    return MAX_ADDON_IDB_PAYLOAD_BYTES + 1;
  }
}

export async function invokeAddonCoreAction(addonId, action, payload = {}) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return { ok: false, reason: "invalid_addon_id" };

  const addon = listRegisteredAddons().find((entry) => entry.id === normalizedId);
  const installedMeta = listInstalledAddonMeta()[normalizedId] || null;

  if (!addon) {
    if (action === "feature.enable" || action === "feature.disable") {
      if (!installedMeta?.installedSeenAt) return { ok: false, reason: "addon_not_registered" };

      const enabled = action === "feature.enable";
      const nextStatusMessage = enabled
        ? ""
        : "Disabled from core. It will remain off when the add-on loads.";

      const stateBucket = ensureAddonStateBucket(normalizedId);
      stateBucket.enabled = enabled;

      const persisted = await persistAddonsState();
      const persistedMeta = await upsertInstalledAddonMeta(normalizedId, {
        statusMessage: nextStatusMessage,
      });
      if (!persisted.ok || !persistedMeta.ok) return { ok: false, reason: "storage_error" };

      if (!enabled) {
        addonLifecycle.emitLifecycleCommand(normalizedId, "before-disable");
        addonLifecycle.requestTeardown(normalizedId, "disable");
      }

      return { ok: true, value: { deferred: true, enabled } };
    }

    return { ok: false, reason: "addon_not_registered" };
  }

  if (action === "addon.access") {
    return {
      ok: true,
      value: {
        blocked: Boolean(addon.blocked),
        trusted: Boolean(addon.trusted),
        capabilities: Array.isArray(addon.capabilities) ? [...addon.capabilities] : [],
      },
    };
  }

  if (addon.blocked) return { ok: false, reason: "addon_blocked" };

  const allowed = new Set(Array.isArray(addon.capabilities) ? addon.capabilities : []);
  if (!isAddonActionAllowed(allowed, action)) return { ok: false, reason: "permission_denied" };
  const result = await invokeRegisteredAddonCoreAction({
    addonId: normalizedId,
    action,
    payload,
    allowed,
    deps: {
      showToast,
      emitAddonLifecycleCommand: addonLifecycle.emitLifecycleCommand,
      requestAddonTeardown: addonLifecycle.requestTeardown,
      cancelAddonTeardown: addonLifecycle.cancelTeardown,
      updateAddonStatus,
      ensureAddonStateBucket,
      persistAddonsState,
      upsertInstalledAddonMeta,
      measurePayloadBytes,
      idbGetForAddon,
      idbPutForAddon,
      idbDeleteForAddon,
      idbBulkPutForAddon,
      idbQueryForAddon,
      idbCountForAddon,
      watchAddonObserver,
      unwatchAddonObserver,
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
      openConfirmDialog,
      sanitizeAddonStyleId,
      registerAddonStyle,
      unregisterAddonStyle,
      emitAddonCommand: (addonId, command, detail = {}) =>
        emitAddonCommand(addonId, command, detail, ADDON_COMMAND_EVENT),
    },
    limits: {
      maxAddonStorageValueBytes: MAX_ADDON_STORAGE_VALUE_BYTES,
      maxAddonStorageTotalBytes: MAX_ADDON_STORAGE_TOTAL_BYTES,
      maxAddonIdbPayloadBytes: MAX_ADDON_IDB_PAYLOAD_BYTES,
      maxAddonIdbBulkItems: MAX_ADDON_IDB_BULK_ITEMS,
      maxAddonUiHtmlBytes: MAX_ADDON_UI_HTML_BYTES,
      maxAddonStyleTextBytes: MAX_ADDON_STYLE_TEXT_BYTES,
    },
  });

  if (
    result?.reason === "unsupported_action" &&
    typeof action === "string" &&
    action.startsWith("ui.")
  ) {
    console.warn(
      `[addonsService] Addon "${normalizedId}" called unrecognized UI action "${action}". ` +
        `Migrate direct style injection to ui.style.register({ styleId, cssText }).`,
    );
  }

  return result;
}

export function initAddonsConsoleBridge() {
  return initAddonsBridgeServer({
    marker: ADDONS_DEV_BRIDGE_MARKER,
    devCommandEvent: ADDONS_DEV_COMMAND_EVENT,
    apiVersion: ADDONS_API_VERSION,
    onRegister: (addon) => {
      const snapshot = registerAddon(addon || {});
      const addonId = sanitizeAddonId(addon?.id);
      if (!addonId) return;

      const registered = snapshot.find((entry) => entry.id === addonId);
      if (registered?.blocked) {
        window.dispatchEvent(
          new CustomEvent(ADDON_COMMAND_EVENT, {
            detail: {
              addonId,
              command: "disable",
            },
          }),
        );
        return;
      }

      const stateBucket = ensureAddonStateBucket(addonId);
      // Enforce persisted disabled state once, but avoid re-emitting disable
      // when the addon is already registered as disabled (prevents feedback loops
      // for addons that re-register after status updates).
      if (stateBucket?.enabled === false && registered?.status !== "disabled") {
        window.dispatchEvent(
          new CustomEvent(ADDON_COMMAND_EVENT, {
            detail: {
              addonId,
              command: "disable",
            },
          }),
        );
      }

      const capabilities = Array.isArray(registered?.capabilities)
        ? [...registered.capabilities]
        : [];
      const pageScopes = Array.isArray(registered?.pageScopes) ? [...registered.pageScopes] : [];
      addonLifecycle.emitLifecycleCommand(addonId, "after-register", { capabilities, pageScopes });
    },
    onUnregister: (addonId) => {
      unregisterAddon(addonId);
    },
    onUpdateStatus: (addonId, status, statusMessage) => {
      updateAddonStatus(addonId, status, statusMessage || "");
    },
    onTeardownComplete: (addonId) => {
      addonLifecycle.acknowledgeTeardown(addonId);
    },
    onInvokeCoreAction: (addonId, action, payload) =>
      invokeAddonCoreAction(addonId, action, payload || {}),
  });
}
