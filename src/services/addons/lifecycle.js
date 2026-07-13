import { ADDON_COMMAND_EVENT } from "./shared.js";

export function emitAddonCommand(addonId, command, detail = {}, eventName = ADDON_COMMAND_EVENT) {
  window.dispatchEvent(
    new CustomEvent(eventName, {
      detail: {
        addonId,
        command,
        ...detail,
      },
    }),
  );
}

export function createAddonLifecycleOrchestrator({
  sanitizeAddonId,
  listRegisteredAddons,
  cleanupAddonObserverSubscriptions,
  cleanupAddonUi,
  teardownWatchdogMs = 1200,
  eventName = ADDON_COMMAND_EVENT,
}) {
  const addonTeardownWatchdogs = new Map();

  function emitLifecycleCommand(addonId, command, detail = {}) {
    emitAddonCommand(addonId, command, detail, eventName);
  }

  function clearTeardownWatchdog(addonId) {
    const timeoutId = addonTeardownWatchdogs.get(addonId);
    if (!timeoutId) return false;
    window.clearTimeout(timeoutId);
    addonTeardownWatchdogs.delete(addonId);
    return true;
  }

  function forceCleanup(addonId) {
    cleanupAddonObserverSubscriptions(addonId);
    cleanupAddonUi(addonId);
  }

  function requestTeardown(addonId, reason = "unknown") {
    const normalizedId = sanitizeAddonId(addonId);
    if (!normalizedId) return;

    clearTeardownWatchdog(normalizedId);
    emitLifecycleCommand(normalizedId, "teardown", {
      reason,
      watchdogMs: teardownWatchdogMs,
    });

    // Core-owned UI is not executable teardown state. Remove it immediately so
    // a disabled, blocked, or out-of-scope add-on cannot leave page UI behind
    // while its cooperative teardown handler is still running.
    cleanupAddonUi(normalizedId);

    const timeoutId = window.setTimeout(() => {
      addonTeardownWatchdogs.delete(normalizedId);
      console.warn(
        `[addonsService] Teardown watchdog expired for addon "${normalizedId}" (reason: ${reason}). Applying hard cleanup.`,
      );
      forceCleanup(normalizedId);
    }, teardownWatchdogMs);

    addonTeardownWatchdogs.set(normalizedId, timeoutId);
  }

  function acknowledgeTeardown(addonId) {
    const normalizedId = sanitizeAddonId(addonId);
    if (!normalizedId) return false;

    const cleared = clearTeardownWatchdog(normalizedId);
    if (!cleared) return false;

    forceCleanup(normalizedId);
    return true;
  }

  function cancelTeardown(addonId) {
    const normalizedId = sanitizeAddonId(addonId);
    if (!normalizedId) return false;
    return clearTeardownWatchdog(normalizedId);
  }

  function notifyAllBeforePageChange() {
    const registered = listRegisteredAddons();
    for (const addon of registered) {
      if (!addon?.id) continue;
      requestTeardown(addon.id, "page-change");
      emitLifecycleCommand(addon.id, "before-page-change");
    }
  }

  function shutdownAll(reason = "runtime teardown") {
    const registered = listRegisteredAddons();
    for (const addon of registered) {
      if (!addon?.id) continue;
      requestTeardown(addon.id, reason);
      clearTeardownWatchdog(addon.id);
      forceCleanup(addon.id);
    }
    for (const addonId of [...addonTeardownWatchdogs.keys()]) {
      clearTeardownWatchdog(addonId);
      forceCleanup(addonId);
    }
    return { cleaned: registered.filter((addon) => addon?.id).length };
  }

  return {
    emitLifecycleCommand,
    requestTeardown,
    acknowledgeTeardown,
    cancelTeardown,
    notifyAllBeforePageChange,
    shutdownAll,
  };
}
