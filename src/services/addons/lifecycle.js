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
  hardCleanupAddonOwner,
  teardownWatchdogMs = 1200,
  eventName = ADDON_COMMAND_EVENT,
}) {
  const addonTeardownWatchdogs = new Map();
  const addonTeardownStates = new Map();
  let commandSequence = 0;

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

  function forceCleanup(addonId, reason = "hard-cleanup", state = null) {
    if (state?.hardCleaned) return false;
    cleanupAddonObserverSubscriptions?.(addonId);
    cleanupAddonUi?.(addonId);
    hardCleanupAddonOwner?.(addonId, reason);
    if (state) state.hardCleaned = true;
    return true;
  }

  function createTeardownState(addonId, reason) {
    const previous = addonTeardownStates.get(addonId);
    const state = {
      addonId,
      state: "tearing-down",
      generation: Number(previous?.generation || 0) + 1,
      commandId: `core:${addonId}:teardown:${++commandSequence}`,
      reason: String(reason || "unknown"),
      requestedAt: Date.now(),
      acknowledged: false,
      hardCleaned: false,
      completedAt: null,
    };
    addonTeardownStates.set(addonId, state);
    return state;
  }

  function requestTeardown(addonId, reason = "unknown") {
    const normalizedId = sanitizeAddonId(addonId);
    if (!normalizedId) return null;

    const existing = addonTeardownStates.get(normalizedId);
    if (existing && !existing.cancelled && !existing.acknowledged && !existing.hardCleaned) {
      return { ...existing };
    }

    clearTeardownWatchdog(normalizedId);
    const state = createTeardownState(normalizedId, reason);
    emitLifecycleCommand(normalizedId, "teardown", {
      reason: state.reason,
      commandId: state.commandId,
      generation: state.generation,
      terminal: true,
      watchdogMs: teardownWatchdogMs,
    });

    // Core-owned UI is not executable teardown state. Remove it immediately so
    // a disabled, blocked, or out-of-scope add-on cannot leave page UI behind
    // while its cooperative teardown handler is still running.
    cleanupAddonUi?.(normalizedId);

    const timeoutId = window.setTimeout(() => {
      addonTeardownWatchdogs.delete(normalizedId);
      const current = addonTeardownStates.get(normalizedId);
      if (!current || current.commandId !== state.commandId || current.acknowledged) return;
      current.state = "terminated";
      current.completedAt = Date.now();
      console.warn(
        `[addonsService] Teardown watchdog expired for addon "${normalizedId}" (reason: ${state.reason}). Applying hard cleanup.`,
      );
      forceCleanup(normalizedId, "teardown-watchdog", current);
    }, teardownWatchdogMs);

    addonTeardownWatchdogs.set(normalizedId, timeoutId);
    return { ...state };
  }

  function acknowledgeTeardown(addonId) {
    const normalizedId = sanitizeAddonId(addonId);
    if (!normalizedId) return false;
    const state = addonTeardownStates.get(normalizedId);
    if (!state || state.acknowledged || state.cancelled || state.hardCleaned) return false;

    clearTeardownWatchdog(normalizedId);
    state.acknowledged = true;
    state.state = "terminated";
    state.completedAt = Date.now();
    forceCleanup(normalizedId, "teardown-acknowledged", state);
    return true;
  }

  function cancelTeardown(addonId) {
    const normalizedId = sanitizeAddonId(addonId);
    if (!normalizedId) return false;
    const state = addonTeardownStates.get(normalizedId);
    if (!state || state.acknowledged || state.hardCleaned) return false;
    clearTeardownWatchdog(normalizedId);
    state.cancelled = true;
    state.state = "cancelled";
    return true;
  }

  function notifyAllBeforePageChange() {
    const registered = listRegisteredAddons();
    for (const addon of registered) {
      if (!addon?.id) continue;
      requestTeardown(addon.id, "page-change");
      emitLifecycleCommand(addon.id, "before-page-change", {
        commandId: `core:${addon.id}:page-change:${++commandSequence}`,
        reason: "page-change",
      });
    }
  }

  function shutdownAll(reason = "runtime teardown") {
    const registered = listRegisteredAddons();
    for (const addon of registered) {
      if (!addon?.id) continue;
      requestTeardown(addon.id, reason);
      clearTeardownWatchdog(sanitizeAddonId(addon.id));
      const normalizedId = sanitizeAddonId(addon.id);
      const state = addonTeardownStates.get(normalizedId);
      if (state) {
        state.state = "terminated";
        state.completedAt = Date.now();
      }
      forceCleanup(normalizedId, reason, state);
    }
    for (const addonId of [...addonTeardownWatchdogs.keys()]) {
      clearTeardownWatchdog(addonId);
      forceCleanup(addonId, reason, addonTeardownStates.get(addonId));
    }
    return { cleaned: registered.filter((addon) => addon?.id).length };
  }

  function getSnapshot() {
    return {
      watchdogs: [...addonTeardownWatchdogs.keys()],
      owners: [...addonTeardownStates.values()].map((state) => ({ ...state })),
    };
  }

  return {
    emitLifecycleCommand,
    requestTeardown,
    acknowledgeTeardown,
    cancelTeardown,
    notifyAllBeforePageChange,
    shutdownAll,
    getSnapshot,
  };
}
