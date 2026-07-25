import {
  LIBRARY_SETTINGS_DEFAULT,
  LIBRARY_STORAGE_KEY,
} from "../constants.js";

export function createLibraryRegistration({
  core,
  runtime,
  getEnabled,
  getShowPageButtons,
}) {
  function statusMessage() {
    if (!getEnabled()) return "Library add-on is installed but disabled.";
    return getShowPageButtons()
      ? "Library button is available site-wide; quick add is active on thread pages."
      : "Library controls are available in the add-on panel.";
  }

  function panelBody() {
    return getShowPageButtons()
      ? "Use the bottom-left page dock to open Library anywhere on F95. Save/Remove appears when you are on a thread page."
      : "Page buttons are hidden. Use the actions below to save the current thread or open the library manager.";
  }

  function register() {
    core.registerAddon({
      id: runtime.addonId,
      name: runtime.addonName,
      version: runtime.addonVersion,
      description: runtime.addonDescription,
      status: getEnabled() ? "installed" : "disabled",
      statusMessage: statusMessage(),
      panelTitle: runtime.addonName,
      panelBody: panelBody(),
      panelSettingsTitle: "Library Settings",
      panelSettingsDescription:
        "Control whether the page dock shows library buttons while keeping the manager available in this panel.",
      panelSettingsStorageKey: LIBRARY_STORAGE_KEY,
      panelSettingsDefaults: LIBRARY_SETTINGS_DEFAULT,
      panelSettings: [
        {
          path: "showPageButtons",
          text: "Show page dock buttons",
          tooltip:
            "Show the Library dock button across F95 pages. Save/Remove only appears on thread pages.",
        },
      ],
      panelActions: [
        { id: "save-current-thread", label: "Save Current Thread" },
        {
          id: "open-library",
          label: "Open Library",
          variant: "secondary",
          requiresActivePage: false,
        },
      ],
      capabilities: runtime.capabilities,
      requiresCore: runtime.requiresCore,
      pageScopes: runtime.pageScopes,
      runtimeMode: runtime.runtimeMode,
      matches: runtime.matches,
    });
  }

  function publishStatus() {
    core.updateStatus(
      getEnabled() ? "installed" : "disabled",
      statusMessage(),
    );
    register();
  }

  function publishBroken(error) {
    const message = error?.message
      ? String(error.message)
      : String(error ?? "Unknown initialization error");
    core.updateStatus("broken", `Failed to initialize: ${message}`);
  }

  return { register, publishStatus, publishBroken };
}
