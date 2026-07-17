import { debugLog } from "../../core/logger.js";
import { getAddonsCoreActionThrottleConfig, isAddonsServiceDisabled } from "./apiPolicy.js";
import { initAddonsBridgeServer } from "./bridgeServer.js";
import { getCanonicalAddonId, initTrustedAddonCatalog } from "./catalog.js";
import { invokeAddonCoreAction } from "./invocation.js";
import {
  registerAddon,
  updateAddonStatus,
  validateAddonRegistration,
} from "./registry.js";
import { addonLifecycle, unregisterAddon } from "./runtimeLifecycle.js";
import {
  ADDONS_API_VERSION,
  ADDONS_DEV_BRIDGE_MARKER,
  ADDONS_DEV_COMMAND_EVENT,
  ADDON_COMMAND_EVENT,
  sanitizeAddonId,
} from "./shared.js";
import { getAddonState, upsertInstalledAddonMeta } from "./state.js";

function dispatchAddonCommand(addonId, command, detail = {}) {
  window.dispatchEvent(new CustomEvent(ADDON_COMMAND_EVENT, {
    detail: { addonId, command, ...detail },
  }));
}

function handleRegistration(addon) {
  const registration = validateAddonRegistration(addon || {});
  const addonId = sanitizeAddonId(addon?.id);
  if (!registration.ok) {
    debugLog("addonsService", `Rejected add-on registration (id=${addonId}, reason=${registration.reason}).`, {
      level: "warn",
      data: { addonId, reason: registration.reason, errors: registration.errors },
    });
    if (addonId) dispatchAddonCommand(addonId, "disable", { reason: registration.reason });
    return;
  }

  const persistedState = getAddonState(addonId);
  const hasPersistedEnabled = Object.hasOwn(persistedState, "enabled");
  const desiredEnabled = hasPersistedEnabled
    ? persistedState.enabled !== false
    : String(addon?.status || "installed") !== "disabled";
  const effectiveAddon = desiredEnabled ? addon : {
    ...addon,
    status: "disabled",
    statusMessage: String(addon?.statusMessage || "Disabled from core.").trim(),
  };
  const snapshot = registerAddon(effectiveAddon);
  const registered = snapshot.find((entry) => entry.id === getCanonicalAddonId(addonId));
  if (!registered) return;

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

  if (registered.blocked) {
    dispatchAddonCommand(addonId, "disable");
    return;
  }
  if (persistedState?.enabled === false && registered.status !== "disabled") {
    dispatchAddonCommand(addonId, "disable");
  }
  addonLifecycle.emitLifecycleCommand(addonId, "after-register", {
    capabilities: [...(registered.capabilities || [])],
    pageScopes: [...(registered.pageScopes || [])],
  });
}

export async function initAddonsConsoleBridge() {
  if (isAddonsServiceDisabled()) return false;
  await initTrustedAddonCatalog();
  return initAddonsBridgeServer({
    marker: ADDONS_DEV_BRIDGE_MARKER,
    devCommandEvent: ADDONS_DEV_COMMAND_EVENT,
    apiVersion: ADDONS_API_VERSION,
    isServiceDisabled: isAddonsServiceDisabled,
    getCoreActionThrottleConfig: getAddonsCoreActionThrottleConfig,
    onRegister: handleRegistration,
    onUnregister: unregisterAddon,
    onUpdateStatus: (addonId, status, statusMessage) => updateAddonStatus(addonId, status, statusMessage || ""),
    onTeardownComplete: (addonId) => addonLifecycle.acknowledgeTeardown(addonId),
    onInvokeCoreAction: (addonId, action, payload) => invokeAddonCoreAction(addonId, action, payload || {}),
  });
}

export function getAddonBootstrapContractSnapshot() {
  return Object.freeze({
    marker: ADDONS_DEV_BRIDGE_MARKER,
    commandEvent: ADDONS_DEV_COMMAND_EVENT,
    responseEvent: ADDON_COMMAND_EVENT,
    protocolVersion: ADDONS_API_VERSION,
    registrationTransport: "custom-event",
  });
}
