import { stateManager, config, defaultAddonsApiThrottleSettings } from "../config.js";
import { showToast } from "../ui/components/toast.js";
import { openConfirmDialog } from "../ui/components/dialog.js";
import { debugLog } from "../core/logger.js";
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
  validateAddonRegistration,
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
  getCanonicalAddonId,
  getTrustedCatalogEntry,
  reloadTrustedAddonCatalog,
  isCatalogFresh,
  listTrustedAddonCatalog,
} from "./addons/catalog.js";
import { resolveAddonAccess } from "./addons/access.js";
import {
  cleanupAddonObserverSubscriptions,
  unwatchAddonObserver,
  watchAddonObserver,
} from "./addons/observer.js";
import { initAddonsBridgeServer, shutdownAddonsBridgeServer } from "./addons/bridgeServer.js";
import { createAddonLifecycleOrchestrator, emitAddonCommand } from "./addons/lifecycle.js";
import { invokeRegisteredAddonCoreAction, isAddonActionAllowed } from "./addons/coreActions.js";
import { getAddonActionScopePolicy } from "./addons/actions/policy.js";
import { buildKnownAddonsSnapshot } from "./addons/knownAddons.js";
import { scopeAppliesToCurrentPage } from "./addons/scope.js";
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

export { listRegisteredAddons, replaceRegisteredAddons, registerAddon, validateAddonRegistration, subscribeAddonsRegistry };
export { getAddonState, setAddonStateValue, clearAddonState };
export { isCatalogFresh };
export function getAddonLifecycleSnapshot() {
  return addonLifecycle.getSnapshot();
}
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

export function shutdownAddonsService(reason = "runtime teardown") {
  const summary = addonLifecycle.shutdownAll(reason);
  replaceRegisteredAddons([]);
  shutdownAddonsBridgeServer();
  return summary;
}

const CORE_PAGE_SCOPE_FLAGS = Object.freeze([
  ["f95zone", "isF95Zone"],
  ["thread", "isThread"],
  ["latest", "isLatest"],
]);

function getCurrentPageScopes() {
  return CORE_PAGE_SCOPE_FLAGS.filter(([, stateKey]) => stateManager.get(stateKey)).map(
    ([scope]) => scope,
  );
}

export function listKnownAddons() {
  const registered = listRegisteredAddons();
  const catalog = listTrustedAddonCatalog();
  const installedMeta = listInstalledAddonMeta();
  const currentScopes = getCurrentPageScopes();
  const catalogFresh = isCatalogFresh();
  const currentUrl =
    typeof window !== "undefined" && window.location ? String(window.location.href || "") : "";

  return buildKnownAddonsSnapshot({
    registered,
    catalog,
    installedMeta,
    currentScopes,
    currentUrl,
    catalogFresh,
    trustedIds: config.addons?.trustedIds,
    allowUntrusted: Boolean(config.globalSettings?.allowUntrustedAddons),
    getAddonState,
  });
}

export function refreshAddonSecurityPolicies({ reloadCatalog = false } = {}) {
  if (reloadCatalog) reloadTrustedAddonCatalog();
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
  shutdownAddonsBridgeServer();

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

export function getAddonActionBlockReason(addon, action) {
  const reason = getAddonExecutionBlockReason(addon);
  if (
    reason === "addon_disabled" &&
    (action === "feature.enable" || action === "feature.disable")
  ) {
    return null;
  }
  return reason === "addon_out_of_scope" && getAddonActionScopePolicy(action) === "management"
    ? null
    : reason;
}

async function processUnregisteredAddonAction(addonId, action, installedMeta) {
  if (
    getAddonActionScopePolicy(action) !== "management" ||
    (action !== "feature.enable" && action !== "feature.disable")
  ) {
    return { ok: false, reason: "addon_not_registered" };
  }
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
  const access = resolveAddonAccessForAddon(addon);
  return {
    ok: true,
    value: {
      blocked: access.isBlocked,
      trusted: access.isTrusted,
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

export function getAddonExecutionBlockReason(addon, currentScopes = getCurrentPageScopes()) {
  if (!addon) return "addon_not_registered";
  const access = resolveAddonAccessForAddon(addon, currentScopes);
  if (access.blockReason === "identity_error") return "addon_identity_error";
  if (access.blockReason === "untrusted_disallowed") return "addon_untrusted";
  if (access.blockReason === "activation_mismatch") return "addon_activation_mismatch";
  if (access.blockReason === "out_of_scope") return "addon_out_of_scope";
  if (access.isBlocked) return "addon_blocked";
  if (!access.isTrusted) return "addon_untrusted";
  if (!access.isEnabled || addon.status === "disabled") return "addon_disabled";
  return null;
}

function resolveAddonAccessForAddon(addon, currentScopes = undefined) {
  if (!addon || typeof addon !== "object") {
    return resolveAddonAccess();
  }

  // A few service contract tests use a minimal projection without an id. Keep
  // those projections compatible while all real registrations use the pure
  // identity-aware resolver below.
  if (!sanitizeAddonId(addon.id) && ("trusted" in addon || "blocked" in addon)) {
    const fallbackScopeApplies = Array.isArray(currentScopes)
      ? scopeAppliesToCurrentPage(
          Array.isArray(addon.pageScopes) ? addon.pageScopes : [],
          currentScopes,
        )
      : true;
    const fallbackBlockReason = addon.blocked
      ? "addon_blocked"
      : !addon.trusted
        ? "untrusted_disallowed"
        : addon.status !== "disabled" && !fallbackScopeApplies
          ? "out_of_scope"
          : null;
    return {
      isTrusted: Boolean(addon.trusted),
      trustSource: Boolean(addon.trusted) ? "projection" : "none",
      identityStatus: "projection",
      isEnabled: addon.status !== "disabled",
      isBlocked: Boolean(fallbackBlockReason),
      blockReason: fallbackBlockReason,
      canEnable: Boolean(addon.trusted),
      matchesCurrentPage: true,
      scopeApplies: fallbackScopeApplies,
      supportsCurrentPage: fallbackScopeApplies,
    };
  }

  return resolveAddonAccess({
    id: addon.id,
    addon,
    catalogEntry: getTrustedCatalogEntry(addon.id),
    trustedIds: config.addons?.trustedIds,
    allowUntrusted: Boolean(config.globalSettings?.allowUntrustedAddons),
    currentScopes,
    currentUrl:
      typeof window !== "undefined" && window.location
        ? String(window.location.href || "")
        : "",
  });
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

  const executionBlockReason = getAddonActionBlockReason(addon, action);
  if (executionBlockReason) return { ok: false, reason: executionBlockReason };

  const allowed = getAddonPermissions(addon);
  if (!isAddonActionAllowed(allowed, action)) return { ok: false, reason: "permission_denied" };

  const result = await invokeRegisteredAddonCoreAction({
    addonId: normalizedId,
    action,
    payload,
    allowed,
    deps: ADDON_CORE_ACTION_DEPS,
    limits: ADDON_CORE_ACTION_LIMITS,
    authorize: () => {
      const currentAddon = getRegisteredAddon(normalizedId);
      const reason = getAddonActionBlockReason(currentAddon, action);
      if (reason) return reason;
      return isAddonActionAllowed(getAddonPermissions(currentAddon), action) ? null : "permission_denied";
    },
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
      debugLog("addonsService", `Received add-on registration (id=${String(addon?.id || "")}, version=${String(addon?.version || "")}, status=${String(addon?.status || "")}, scopes=${Array.isArray(addon?.pageScopes) ? addon.pageScopes.join(",") : ""}, runtimeMode=${String(addon?.runtimeMode || "")}).`, {
        data: {
          id: addon?.id,
          version: addon?.version,
          status: addon?.status,
          pageScopes: addon?.pageScopes,
          runtimeMode: addon?.runtimeMode,
          matches: addon?.matches,
        },
      });
      const registration = validateAddonRegistration(addon || {});
      const addonId = sanitizeAddonId(addon?.id);
      if (!registration.ok) {
        debugLog("addonsService", `Rejected add-on registration (id=${addonId}, reason=${String(registration.reason || "")}, errors=${Array.isArray(registration.errors) ? registration.errors.join(",") : ""}).`, {
          level: "warn",
          data: { addonId, reason: registration.reason, errors: registration.errors },
        });
        if (addonId) {
          window.dispatchEvent(
            new CustomEvent(ADDON_COMMAND_EVENT, {
              detail: { addonId, command: "disable", reason: registration.reason },
            }),
          );
        }
        return;
      }
      const snapshot = registerAddon(addon || {});
      const registeredAddon = snapshot.find((entry) => entry.id === getCanonicalAddonId(addonId));
      debugLog("addonsService", `Accepted add-on registration (id=${addonId}, registered=${Boolean(registeredAddon)}, trusted=${String(registeredAddon?.trusted)}, blocked=${String(registeredAddon?.blocked)}, blockReason=${String(registeredAddon?.blockReason || "")}).`, {
        data: {
          addonId,
          registered: Boolean(registeredAddon),
          trusted: registeredAddon?.trusted,
          blocked: registeredAddon?.blocked,
          blockReason: registeredAddon?.blockReason,
        },
      });
      if (!addonId) return;

      const registered = registeredAddon;
      if (registered) {
        void upsertInstalledAddonMeta(addonId, {
          name: registered.name,
          version: registered.version,
          description: registered.description,
          pageScopes: registered.pageScopes,
          runtimeMode: registered.runtimeMode,
          matches: registered.matches,
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
      debugLog("addonsService", "Received add-on unregister.", { data: { addonId } });
      unregisterAddon(addonId);
    },
    onUpdateStatus: (addonId, status, statusMessage) => {
      debugLog("addonsService", `Received add-on status update (id=${String(addonId || "")}, status=${String(status || "")}).`, {
        data: { addonId, status, statusMessage },
      });
      updateAddonStatus(addonId, status, statusMessage || "");
    },
    onTeardownComplete: (addonId) => {
      debugLog("addonsService", "Received add-on teardown acknowledgment.", { data: { addonId } });
      addonLifecycle.acknowledgeTeardown(addonId);
    },
    onInvokeCoreAction: (addonId, action, payload) =>
      invokeAddonCoreAction(addonId, action, payload || {}),
  });
}
