import {
  registerAddonRuntime,
  updateAddonRuntimeStatus,
} from "../api/bridge.js";
import { THREAD_UTILITY_SETTINGS_KEY } from "../constants.js";
import {
  THREAD_UTILITY_PANEL_SETTINGS,
  THREAD_UTILITY_SETTINGS_DEFAULTS,
} from "./settings.js";

function statusMessage(enabled) {
  return enabled ? "Thread Utility active." : "Thread Utility disabled.";
}

export function createThreadUtilityRegistration({ core, runtime, isEnabled }) {
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
      panelBody: "Compact thread information and user-triggered thread tools.",
      panelSettingsTitle: "Thread Utility Settings",
      panelSettingsDescription: "Configure the thread-page launcher.",
      panelSettingsStorageKey: THREAD_UTILITY_SETTINGS_KEY,
      panelSettingsDefaults: THREAD_UTILITY_SETTINGS_DEFAULTS,
      panelSettings: THREAD_UTILITY_PANEL_SETTINGS,
      capabilities: runtime.capabilities,
      requiresCore: runtime.requiresCore,
      pageScopes: runtime.pageScopes,
      runtimeMode: runtime.runtimeMode,
      matches: runtime.matches,
    };
  }

  function register() {
    return registerAddonRuntime(core, descriptor());
  }

  function publishStatus() {
    const enabled = isEnabled();
    updateAddonRuntimeStatus(
      core,
      enabled ? "installed" : "disabled",
      statusMessage(enabled),
    );
    return register();
  }

  return { descriptor, register, publishStatus };
}
