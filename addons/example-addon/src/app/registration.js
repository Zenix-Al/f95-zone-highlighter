import {
  registerAddonRuntime,
  updateAddonRuntimeStatus,
} from "../api/bridge.js";
import { debugLog } from "../../../shared/debugLog.js";
import {
  EXAMPLE_PANEL_SETTINGS,
  EXAMPLE_SETTINGS_DEFAULTS,
} from "./settings.js";
import { EXAMPLE_SETTINGS_KEY } from "../constants.js";

function statusMessage(enabled) {
  return enabled ? "API playground active." : "API playground disabled.";
}

export function createExampleRegistration({ core, runtime, isEnabled }) {
  function descriptor() {
    const enabled = isEnabled();
    return {
      id: runtime.addonId,
      name: runtime.addonName,
      version: runtime.addonVersion,
      description: runtime.addonDescription,
      status: enabled ? "installed" : "disabled",
      statusMessage: statusMessage(enabled),
      panelTitle: runtime.addonName,
      panelBody:
        "Core API playground demonstrating core-rendered settings and every current add-on-facing action.",
      panelSettingsTitle: "Example Add-on Settings",
      panelSettingsDescription:
        "These controls are declared during registration, rendered by core, and persisted through the add-on storage API.",
      panelSettingsStorageKey: EXAMPLE_SETTINGS_KEY,
      panelSettingsDefaults: EXAMPLE_SETTINGS_DEFAULTS,
      panelSettings: EXAMPLE_PANEL_SETTINGS,
      capabilities: runtime.capabilities,
      requiresCore: runtime.requiresCore,
      pageScopes: runtime.pageScopes,
      runtimeMode: runtime.runtimeMode,
      matches: runtime.matches,
    };
  }

  function register() {
    const registration = descriptor();
    debugLog(runtime.addonId, "Registration payload prepared.", {
      data: {
        id: registration.id,
        version: registration.version,
        status: registration.status,
        pageScopes: registration.pageScopes,
        runtimeMode: registration.runtimeMode,
        matches: registration.matches,
        capabilities: registration.capabilities,
        requiresCore: registration.requiresCore,
        panelSettings: registration.panelSettings,
      },
    });
    return registerAddonRuntime(core, registration);
  }

  function publishStatus() {
    const enabled = isEnabled();
    debugLog(runtime.addonId, "Publishing runtime status.", {
      data: { status: enabled ? "installed" : "disabled", enabled },
    });
    updateAddonRuntimeStatus(
      core,
      enabled ? "installed" : "disabled",
      statusMessage(enabled),
    );
    return register();
  }

  return { descriptor, register, publishStatus };
}
