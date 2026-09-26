import { debugLog } from "../../core/logger.js";
import { shutdownAddonsBridgeServer } from "./bridgeServer.js";
import { createAddonLifecycleOrchestrator } from "./lifecycle.js";
import { cleanupAddonObserverSubscriptions } from "./observer.js";
import {
  listRegisteredAddons,
  replaceRegisteredAddons,
  unregisterAddon as unregisterAddonFromRegistry,
} from "./registry.js";
import { ADDON_COMMAND_EVENT, sanitizeAddonId } from "./shared.js";
import { cleanupAddonUi, getAddonUiPolicySnapshot } from "./uiHost.js";
import { latestMarkerBroker } from "./latestMarkerRuntime.js";

export const ADDON_TEARDOWN_WATCHDOG_MS = 1200;

export const addonLifecycle = createAddonLifecycleOrchestrator({
  sanitizeAddonId,
  listRegisteredAddons,
  cleanupAddonObserverSubscriptions,
  cleanupAddonUi,
  teardownWatchdogMs: ADDON_TEARDOWN_WATCHDOG_MS,
  eventName: ADDON_COMMAND_EVENT,
});

export function getAddonLifecycleSnapshot() {
  return addonLifecycle.getSnapshot();
}

export function notifyAllAddonsBeforePageChange() {
  latestMarkerBroker.cancelPending();
  addonLifecycle.notifyAllBeforePageChange();
}

export function shutdownAddonsService(reason = "runtime teardown") {
  latestMarkerBroker.reset();
  shutdownAddonsBridgeServer();
  const summary = addonLifecycle.shutdownAll(reason);
  replaceRegisteredAddons([]);
  return summary;
}

export function disableAddonsService() {
  latestMarkerBroker.reset();
  shutdownAddonsBridgeServer();
  for (const addon of listRegisteredAddons()) {
    if (addon?.id) addonLifecycle.requestTeardown(addon.id, "service-disabled");
  }
  replaceRegisteredAddons([]);
  return { ok: true };
}

export function unregisterAddon(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return listRegisteredAddons();
  latestMarkerBroker.removeOwner(normalizedId);
  addonLifecycle.requestTeardown(normalizedId, "unregister");
  addonLifecycle.emitLifecycleCommand(normalizedId, "before-unregister");
  return unregisterAddonFromRegistry(normalizedId);
}

export function cleanupAddonRuntimeResources(addonId, reason = "disable") {
  latestMarkerBroker.removeOwner(addonId);
  const before = getAddonUiPolicySnapshot().owners;
  cleanupAddonObserverSubscriptions(addonId);
  cleanupAddonUi(addonId);
  const after = getAddonUiPolicySnapshot().owners;
  debugLog("addonsService", `Cleaned core-owned add-on resources (id=${addonId}, reason=${reason}).`, {
    data: { before, after },
  });
}
