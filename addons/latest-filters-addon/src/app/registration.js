import {
  notifyTeardownComplete,
  registerAddonRuntime,
  updateAddonRuntimeStatus,
} from "../api/bridge.js";
import {
  FILTER_SETTINGS_DEFAULT,
  FILTER_SETTINGS_STORAGE_KEY,
} from "../constants.js";

export function createLatestFiltersRegistration({ core, runtime, state }) {
  function statusMessage() {
    if (!state.enabled) return "Latest Filters add-on is installed but disabled.";
    if (!state.showPageButton) {
      return "Saved filters are available from the add-on panel; the latest-page button is hidden.";
    }
    return "One saved-filters button is available on Latest Updates pages.";
  }

  function register() {
    registerAddonRuntime(core, {
      id: runtime.addonId,
      name: runtime.addonName,
      version: runtime.addonVersion,
      description: runtime.addonDescription,
      status: state.enabled ? "installed" : "disabled",
      statusMessage: statusMessage(),
      panelTitle: runtime.addonName,
      panelBody: state.showPageButton
        ? "Use the Saved Filters button on Latest Updates to open a searchable list of saved presets, see the active preset, and save/apply/update/delete entries."
        : "The page button is hidden. Use the action below while on Latest Updates to open the saved-filters panel.",
      panelSettingsTitle: "Latest Filters Settings",
      panelSettingsDescription:
        "Keep a single Saved Filters button on Latest Updates pages, or hide the page button and use the panel action instead.",
      panelSettingsStorageKey: FILTER_SETTINGS_STORAGE_KEY,
      panelSettingsDefaults: FILTER_SETTINGS_DEFAULT,
      panelSettings: [
        { path: "state.showPageButton", text: "Show page button" },
      ],
      panelActions: [
        {
          id: "open-filters",
          label: "Open Saved Filters",
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

  return {
    register,
    publishStatus() {
      updateAddonRuntimeStatus(
        core,
        state.enabled ? "installed" : "disabled",
        statusMessage(),
      );
      register();
    },
    publishBroken(message) {
      updateAddonRuntimeStatus(core, "broken", String(message || "failed"));
    },
    acknowledgeTeardown: (reason) => notifyTeardownComplete(core, reason),
  };
}
