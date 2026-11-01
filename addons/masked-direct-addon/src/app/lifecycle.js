export const ADDON_COMMAND_EVENT = "f95ue:addon-command";

export function createMaskedDirectLifecycle({
  bridge,
  runtime,
  state,
  settings,
  registration,
  pageBehavior,
  clearOwnedResources,
  diagnostics,
}) {
  let commandHandler = null;
  let terminal = false;

  async function setEnabled(nextEnabled) {
    if (terminal) return;
    if (state.blockedByCore) {
      state.enabled = false;
      clearOwnedResources();
      registration.publishStatus();
      return;
    }

    const shouldEnable = Boolean(nextEnabled);
    if (shouldEnable && !state.enabled) {
      state.enabled = true;
    } else if (!shouldEnable && state.enabled) {
      state.enabled = false;
      clearOwnedResources();
    } else {
      state.enabled = shouldEnable;
    }

    await settings.storageSet("enabled", state.enabled);
    // A previously disabled upgrade may not have read/mirrored its host settings.
    if (state.enabled) await settings.read?.(true);
    registration.publishStatus();
    void pageBehavior.apply();
  }

  async function teardown(reason) {
    if (terminal) return;
    terminal = true;
    console.info(`[${runtime.addonId}] Teardown requested: ${reason}`);
    state.enabled = false;
    clearOwnedResources();
    unbindCommands();
    registration.publishStatus();
    try {
      registration.acknowledgeTeardown(reason);
    } catch {
      // Best effort: terminal cleanup must still complete.
    }
  }

  function refresh() {
    if (terminal) return;
    settings.invalidate();
    const reread = typeof settings.read === "function" ? settings.read(true) : Promise.resolve();
    void Promise.resolve(reread).finally(() => pageBehavior.apply());
  }

  function bindCommands() {
    if (terminal || commandHandler) return;
    commandHandler = (event) => {
      const detail = event?.detail || {};
      if (String(detail.addonId || "") !== runtime.addonId) return;
      const command = String(detail.command || "").trim();
      if (command === "enable") void setEnabled(true);
      else if (command === "disable") void setEnabled(false);
      else if (command === "refresh") refresh();
      else if (command === "teardown") {
        void teardown(String(detail.reason || "requested by core"));
      }
    };
    window.addEventListener(ADDON_COMMAND_EVENT, commandHandler);
  }

  function unbindCommands() {
    if (!commandHandler) return;
    window.removeEventListener(ADDON_COMMAND_EVENT, commandHandler);
    commandHandler = null;
  }

  function installConsoleHelper() {
    window.__F95UE_MASKED_DIRECT_ADDON__ = {
      enable: () => void setEnabled(true),
      disable: () => void setEnabled(false),
      refresh,
    };
  }

  async function refreshAccess() {
    const access = await bridge.getAddonAccess();
    if (!access?.ok || !access.value) {
      state.blockedByCore = true;
      state.enabled = false;
      registration.publishStatus();
      return false;
    }

    state.blockedByCore = Boolean(access.value.blocked);
    if (state.blockedByCore) {
      state.enabled = false;
      registration.publishStatus();
      clearOwnedResources();
      diagnostics.warn("blocked_by_core");
      return false;
    }
    if (access.value.enabled === false) {
      state.enabled = false;
      registration.publishStatus();
      clearOwnedResources();
      return false;
    }
    return true;
  }

  async function initializeEnabledState() {
    const storedEnabled = await settings.storageGet("enabled", true);
    state.enabled = storedEnabled !== false && storedEnabled !== "false";
    installConsoleHelper();
    void pageBehavior.apply();
    registration.publishStatus();
  }

  return {
    bindCommands,
    initializeEnabledState,
    refreshAccess,
    setEnabled,
    teardown,
  };
}
