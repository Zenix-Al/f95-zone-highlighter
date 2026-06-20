import { stateManager, config, defaultAddonsApiThrottleSettings } from "../config.js";
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
  getRegisteredAddon,
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
  getInstalledAddonMeta,
  listInstalledAddonMeta,
  persistAddonsState,
  removeInstalledAddonMeta,
  setAddonStateValue,
  upsertInstalledAddonMeta,
} from "./addons/state.js";
import {
  initTrustedAddonCatalog,
  isCatalogFresh,
  listTrustedAddonCatalog,
} from "./addons/catalog.js";
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
  idbBulkDeleteForAddon,
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
const PAYLOAD_SIZE_ENCODER = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

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

export function isAddonsServiceDisabled() {
  return Boolean(config.globalSettings?.disableAddonsService);
}

function clampAddonsServiceNumber(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function getAddonsCoreActionThrottleConfig() {
  const throttle = config.addons?.service?.apiThrottle || {};

  return {
    windowMs: clampAddonsServiceNumber(
      throttle.coreActionWindowMs,
      defaultAddonsApiThrottleSettings.coreActionWindowMs,
      { min: 250, max: 60000 },
    ),
    maxCount: clampAddonsServiceNumber(
      throttle.coreActionRateMax,
      defaultAddonsApiThrottleSettings.coreActionRateMax,
      { min: 1, max: 1000 },
    ),
    maxConcurrent: clampAddonsServiceNumber(
      throttle.coreActionMaxConcurrent,
      defaultAddonsApiThrottleSettings.coreActionMaxConcurrent,
      { min: 1, max: 100 },
    ),
  };
}

export function notifyAllAddonsBeforePageChange() {
  addonLifecycle.notifyAllBeforePageChange();
}

function getCurrentPageScopes() {
  // Return all currently active state keys as addon scopes
  // Addons can subscribe to any state key names they care about
  const scopes = [];
  const stateKeys = stateManager.getKnownPaths();
  for (const key of stateKeys) {
    if (!key.startsWith("isPageType") && key !== "isDomainMatch") {
      continue;
    }
    if (stateManager.get(key)) {
      scopes.push(key);
    }
  }
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

export function disableAddonsService() {
  const registered = listRegisteredAddons();

  for (const addon of registered) {
    if (!addon?.id) continue;
    addonLifecycle.requestTeardown(addon.id, "service-disabled");
  }

  // Stop reporting runtime entries immediately; remaining UI/observer cleanup is best-effort.
  replaceRegisteredAddons([]);

  return { ok: true };
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
    const json = JSON.stringify(payload ?? null);
    if (PAYLOAD_SIZE_ENCODER) return PAYLOAD_SIZE_ENCODER.encode(json).length;
    // Best-effort fallback (UTF-16 code units, not bytes).
    return json.length;
  } catch {
    return MAX_ADDON_IDB_PAYLOAD_BYTES + 1;
  }
}

function isFeatureToggleAction(action) {
  return action === "feature.enable" || action === "feature.disable";
}

async function processUnregisteredAddonAction(addonId, action, installedMeta) {
  if (!isFeatureToggleAction(action)) return { ok: false, reason: "addon_not_registered" };
  if (!installedMeta?.installedSeenAt) return { ok: false, reason: "addon_not_registered" };

  const enabled = action === "feature.enable";
  const nextStatusMessage = enabled
    ? ""
    : "Disabled from core. It will remain off when the add-on loads.";

  const stateBucket = ensureAddonStateBucket(addonId);
  stateBucket.enabled = enabled;

  const persisted = await persistAddonsState();
  const persistedMeta = await upsertInstalledAddonMeta(addonId, {
    statusMessage: nextStatusMessage,
  });
  if (!persisted.ok || !persistedMeta.ok) return { ok: false, reason: "storage_error" };

  if (!enabled) {
    addonLifecycle.emitLifecycleCommand(addonId, "before-disable");
    addonLifecycle.requestTeardown(addonId, "disable");
  }

  return { ok: true, value: { deferred: true, enabled } };
}

function getAddonAccessResponse(addon) {
  return {
    ok: true,
    value: {
      blocked: Boolean(addon.blocked),
      trusted: Boolean(addon.trusted),
      capabilities: Array.isArray(addon.capabilities) ? [...addon.capabilities] : [],
    },
  };
}

function getAddonThrottleResponse() {
  const coreAction = getAddonsCoreActionThrottleConfig();
  const sustainedRequestsPerSecond =
    coreAction.windowMs > 0
      ? Number(((coreAction.maxCount / coreAction.windowMs) * 1000).toFixed(3))
      : 0;
  const suggestedMinIntervalMs =
    coreAction.maxCount > 0 ? Math.ceil(coreAction.windowMs / coreAction.maxCount) : 0;

  return {
    ok: true,
    value: {
      coreAction: {
        windowMs: coreAction.windowMs,
        maxCount: coreAction.maxCount,
        maxConcurrent: coreAction.maxConcurrent,
        sustainedRequestsPerSecond,
        suggestedMinIntervalMs,
      },
      payloadLimits: {
        storage: {
          maxValueBytes: MAX_ADDON_STORAGE_VALUE_BYTES,
          maxTotalBytes: MAX_ADDON_STORAGE_TOTAL_BYTES,
          maxTagPrefsPayloadBytes: MAX_ADDON_STORAGE_VALUE_BYTES,
        },
        idb: {
          maxPayloadBytes: MAX_ADDON_IDB_PAYLOAD_BYTES,
          maxBulkItems: MAX_ADDON_IDB_BULK_ITEMS,
        },
        ui: {
          maxHtmlBytes: MAX_ADDON_UI_HTML_BYTES,
          maxStyleTextBytes: MAX_ADDON_STYLE_TEXT_BYTES,
        },
      },
    },
  };
}

function getAddonPermissions(addon) {
  return new Set(Array.isArray(addon.capabilities) ? addon.capabilities : []);
}

const ADDON_CORE_ACTION_LIMITS = {
  maxAddonStorageValueBytes: MAX_ADDON_STORAGE_VALUE_BYTES,
  maxAddonStorageTotalBytes: MAX_ADDON_STORAGE_TOTAL_BYTES,
  maxAddonIdbPayloadBytes: MAX_ADDON_IDB_PAYLOAD_BYTES,
  maxAddonIdbBulkItems: MAX_ADDON_IDB_BULK_ITEMS,
  maxAddonUiHtmlBytes: MAX_ADDON_UI_HTML_BYTES,
  maxAddonStyleTextBytes: MAX_ADDON_STYLE_TEXT_BYTES,
};

const ADDON_CORE_ACTION_DEPS = Object.freeze({
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
  idbBulkDeleteForAddon,
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
  emitAddonCommand,
});

function warnOnUnsupportedUiAction(result, addonId, action) {
  if (
    result?.reason === "unsupported_action" &&
    typeof action === "string" &&
    action.startsWith("ui.")
  ) {
    console.warn(
      `[addonsService] Addon "${addonId}" called unrecognized UI action "${action}". ` +
        `Migrate direct style injection to ui.style.register({ styleId, cssText }).`,
    );
  }

  return result;
}

export async function invokeAddonCoreAction(addonId, action, payload = {}) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return { ok: false, reason: "invalid_addon_id" };
  if (action === "addon.throttle") {
    return getAddonThrottleResponse();
  }

  const addon = getRegisteredAddon(normalizedId);
  const installedMeta = getInstalledAddonMeta(normalizedId);

  if (!addon) {
    return await processUnregisteredAddonAction(normalizedId, action, installedMeta);
  }

  if (action === "addon.access") {
    return getAddonAccessResponse(addon);
  }

  if (addon.blocked) return { ok: false, reason: "addon_blocked" };

  const allowed = getAddonPermissions(addon);
  if (!isAddonActionAllowed(allowed, action)) return { ok: false, reason: "permission_denied" };

  const result = await invokeRegisteredAddonCoreAction({
    addonId: normalizedId,
    action,
    payload,
    allowed,
    deps: ADDON_CORE_ACTION_DEPS,
    limits: ADDON_CORE_ACTION_LIMITS,
  });

  return warnOnUnsupportedUiAction(result, normalizedId, action);
}

export function initAddonsConsoleBridge() {
  if (isAddonsServiceDisabled()) return false;

  initTrustedAddonCatalog();
  return initAddonsBridgeServer({
    marker: ADDONS_DEV_BRIDGE_MARKER,
    devCommandEvent: ADDONS_DEV_COMMAND_EVENT,
    apiVersion: ADDONS_API_VERSION,
    isServiceDisabled: isAddonsServiceDisabled,
    getCoreActionThrottleConfig: getAddonsCoreActionThrottleConfig,
    onRegister: (addon) => {
      const snapshot = registerAddon(addon || {});
      const addonId = sanitizeAddonId(addon?.id);
      if (!addonId) return;

      const registered = snapshot.find((entry) => entry.id === addonId);
      if (registered) {
        void upsertInstalledAddonMeta(addonId, {
          name: registered.name,
          version: registered.version,
          description: registered.description,
          pageScopes: registered.pageScopes,
          capabilities: registered.capabilities,
          panelTitle: registered.panelTitle,
          panelBody: registered.panelBody,
          statusMessage: registered.statusMessage,
        });
      }

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
