import { config, stateManager } from "../../config.js";
import {
  ADDON_CORE_ACTION_LIMITS,
  getAddonsCoreActionThrottleConfig,
  MAX_ADDON_IDB_BULK_ITEMS,
  MAX_ADDON_IDB_PAYLOAD_BYTES,
  MAX_ADDON_STORAGE_TOTAL_BYTES,
  MAX_ADDON_STORAGE_VALUE_BYTES,
  MAX_ADDON_STYLE_TEXT_BYTES,
  MAX_ADDON_UI_HTML_BYTES,
} from "./apiPolicy.js";
import { resolveAddonAccess } from "./access.js";
import { getAddonActionDependencies } from "./actionRuntime.js";
import { getAddonActionScopePolicy } from "./actions/policy.js";
import { getTrustedCatalogEntry } from "./catalog.js";
import { invokeRegisteredAddonCoreAction, isAddonActionAllowed } from "./coreActions.js";
import { getRegisteredAddon } from "./registry.js";
import {
  getAddonAvailabilityBlockReason,
  getCurrentAddonPageScopes,
  scopeAppliesToCurrentPage,
} from "./scope.js";
import { sanitizeAddonId } from "./shared.js";
import {
  getAddonState,
  getInstalledAddonMeta,
  setAddonEnabledState,
} from "./state.js";

const DISABLED_ADDON_CLEANUP_ACTIONS = new Set([
  "observer.unwatch",
  "ui.dock.removeButtons",
  "ui.unmount",
  "ui.dialog.close",
  "ui.style.unregister",
]);

export function getCurrentPageScopes() {
  return getCurrentAddonPageScopes(stateManager);
}

export function resolveAddonAccessForAddon(addon, currentScopes = undefined) {
  if (!addon || typeof addon !== "object") return resolveAddonAccess();
  if (!sanitizeAddonId(addon.id) && ("trusted" in addon || "blocked" in addon)) {
    const scopeApplies = Array.isArray(currentScopes)
      ? scopeAppliesToCurrentPage(addon.pageScopes || [], currentScopes)
      : true;
    const blockReason = addon.blocked
      ? "addon_blocked"
      : !addon.trusted
        ? "untrusted_disallowed"
        : null;
    return {
      isTrusted: Boolean(addon.trusted),
      isEnabled: addon.status !== "disabled",
      isBlocked: Boolean(blockReason),
      blockReason,
      scopeApplies,
      availabilityReason: addon.status === "disabled" ? "disabled" : scopeApplies ? null : "out_of_scope",
    };
  }

  const persistedState = getAddonState(addon.id);
  return resolveAddonAccess({
    id: addon.id,
    addon,
    catalogEntry: getTrustedCatalogEntry(addon.id),
    trustedIds: config.addons?.trustedIds,
    allowUntrusted: Boolean(config.globalSettings?.allowUntrustedAddons),
    desiredEnabled: Object.hasOwn(persistedState, "enabled") ? persistedState.enabled : undefined,
    currentScopes,
    currentUrl: typeof window !== "undefined" ? String(window.location?.href || "") : "",
  });
}

export function getAddonExecutionBlockReason(addon, currentScopes = getCurrentPageScopes()) {
  if (!addon) return "addon_not_registered";
  const access = resolveAddonAccessForAddon(addon, currentScopes);
  if (access.blockReason === "identity_error") return "addon_identity_error";
  if (access.blockReason === "untrusted_disallowed") return "addon_untrusted";
  if (access.isBlocked) return "addon_blocked";
  if (!access.isEnabled || addon.status === "disabled") return "addon_disabled";
  return getAddonAvailabilityBlockReason(access);
}

export function getAddonActionBlockReason(addon, action) {
  const reason = getAddonExecutionBlockReason(addon);
  if (reason === "addon_disabled" && (action === "feature.enable" || action === "feature.disable")) return null;
  if (reason === "addon_disabled" && DISABLED_ADDON_CLEANUP_ACTIONS.has(action)) return null;
  return reason === "addon_out_of_scope" && getAddonActionScopePolicy(action) === "management" ? null : reason;
}

function getAddonPermissions(addon, access = resolveAddonAccessForAddon(addon)) {
  if (access.isBlocked) return new Set();
  const source = Array.isArray(addon.requestedCapabilities) ? addon.requestedCapabilities : addon.capabilities;
  return new Set(Array.isArray(source) ? source : []);
}

function getAddonThrottleResponse() {
  const coreAction = getAddonsCoreActionThrottleConfig();
  return { ok: true, value: {
    coreAction: {
      ...coreAction,
      sustainedRequestsPerSecond: coreAction.windowMs > 0
        ? Number(((coreAction.maxCount / coreAction.windowMs) * 1000).toFixed(3))
        : 0,
      suggestedMinIntervalMs: coreAction.maxCount > 0
        ? Math.ceil(coreAction.windowMs / coreAction.maxCount)
        : 0,
    },
    payloadLimits: {
      storage: { maxValueBytes: MAX_ADDON_STORAGE_VALUE_BYTES, maxTotalBytes: MAX_ADDON_STORAGE_TOTAL_BYTES, maxTagPrefsPayloadBytes: MAX_ADDON_STORAGE_VALUE_BYTES },
      idb: { maxPayloadBytes: MAX_ADDON_IDB_PAYLOAD_BYTES, maxBulkItems: MAX_ADDON_IDB_BULK_ITEMS },
      ui: { maxHtmlBytes: MAX_ADDON_UI_HTML_BYTES, maxStyleTextBytes: MAX_ADDON_STYLE_TEXT_BYTES },
    },
  } };
}

function getAddonAccessResponse(addon) {
  const access = resolveAddonAccessForAddon(addon);
  return { ok: true, value: {
    blocked: access.isBlocked,
    blockReason: access.blockReason,
    enabled: access.isEnabled,
    trusted: access.isTrusted,
    capabilities: [...getAddonPermissions(addon, access)],
  } };
}

async function processDeferredManagementAction(addonId, action, installedMeta) {
  if (getAddonActionScopePolicy(action) !== "management" || !["feature.enable", "feature.disable"].includes(action)) {
    return { ok: false, reason: "addon_not_registered" };
  }
  if (!installedMeta?.installedSeenAt) return { ok: false, reason: "addon_not_registered" };
  const enabled = action === "feature.enable";
  const persisted = await setAddonEnabledState(addonId, enabled, {
    statusMessage: enabled ? "" : "Disabled from core. It will remain off when the add-on loads.",
  });
  return persisted.ok
    ? { ok: true, value: { deferred: true, enabled } }
    : { ok: false, reason: "storage_error" };
}

export async function invokeAddonCoreAction(addonId, action, payload = {}) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return { ok: false, reason: "invalid_addon_id" };
  if (action === "addon.throttle") return getAddonThrottleResponse();

  const addon = getRegisteredAddon(normalizedId);
  const installedMeta = getInstalledAddonMeta(normalizedId);
  if (!addon) return processDeferredManagementAction(normalizedId, action, installedMeta);
  if (action === "addon.access") return getAddonAccessResponse(addon);

  const access = resolveAddonAccessForAddon(addon);
  if (["activation_mismatch", "out_of_scope"].includes(access.availabilityReason)
      && ["feature.enable", "feature.disable"].includes(action)) {
    return processDeferredManagementAction(normalizedId, action, installedMeta);
  }

  const blockReason = getAddonActionBlockReason(addon, action);
  if (blockReason) return { ok: false, reason: blockReason };
  const allowed = getAddonPermissions(addon);
  if (!isAddonActionAllowed(allowed, action)) return { ok: false, reason: "permission_denied" };

  const result = await invokeRegisteredAddonCoreAction({
    addonId: normalizedId,
    action,
    payload,
    allowed,
    deps: getAddonActionDependencies(action),
    limits: ADDON_CORE_ACTION_LIMITS,
    authorize: () => {
      const current = getRegisteredAddon(normalizedId);
      const reason = getAddonActionBlockReason(current, action);
      if (reason) return reason;
      return isAddonActionAllowed(getAddonPermissions(current), action) ? null : "permission_denied";
    },
  });

  if (result?.reason === "unsupported_action" && action.startsWith("ui.")) {
    console.warn(`[addonsService] Addon "${normalizedId}" called unrecognized UI action "${action}".`);
  }
  return result;
}
