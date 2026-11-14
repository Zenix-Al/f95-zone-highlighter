import { ADDON_PANEL_SETTINGS, ADDON_SETTINGS_DEFAULT, ADDON_SETTINGS_KEY } from "./settings.js";

export function createMaskedDirectRegistration({
  bridge,
  runtime,
  getIsEnabled,
  getStatusMessage,
}) {
  function register() {
    bridge.dispatchCoreCommand("register", {
      addon: {
        id: runtime.addonId,
        name: runtime.addonName,
        version: runtime.addonVersion,
        description: runtime.addonDescription,
        status: getIsEnabled() ? "installed" : "disabled",
        statusMessage: getStatusMessage(),
        panelTitle: runtime.addonName,
        panelBody:
          "Standalone host automation and quick Resolve buttons for thread download links. Normal links retain the native flow.",
        panelSettingsTitle: "Direct Download Settings",
        panelSettingsDescription:
          "Configure quick Resolve buttons, standalone host automation and optional local closing. Resolve works without core; settings saved here are mirrored locally.",
        panelSettingsStorageKey: ADDON_SETTINGS_KEY,
        panelSettingsDefaults: ADDON_SETTINGS_DEFAULT,
        panelSettings: ADDON_PANEL_SETTINGS,
        capabilities: runtime.capabilities,
        requiresCore: runtime.requiresCore,
        pageScopes: runtime.pageScopes,
        runtimeMode: runtime.runtimeMode,
        matches: runtime.matches,
      },
    });
  }

  function publishStatus() {
    bridge.dispatchCoreCommand("update-status", {
      addonId: runtime.addonId,
      status: getIsEnabled() ? "installed" : "disabled",
      statusMessage: getStatusMessage(),
    });
  }

  function publishBroken(error) {
    const message = error?.message
      ? String(error.message)
      : String(error ?? "Unknown initialization error");
    console.error(`[${runtime.addonId}] Fatal initialization error:`, error);
    bridge.dispatchCoreCommand("update-status", {
      addonId: runtime.addonId,
      status: "broken",
      statusMessage: `Failed to initialize: ${message}`,
    });
  }

  function acknowledgeTeardown(reason) {
    bridge.dispatchCoreCommand("teardown-complete", {
      addonId: runtime.addonId,
      reason,
    });
  }

  return { register, publishStatus, publishBroken, acknowledgeTeardown };
}
