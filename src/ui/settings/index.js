import { stateManager } from "../../config.js";
import {
  initAddonsRegistryBridge,
  updateRegisteredAddons,
} from "../components/addons/settingsController.js";

import { ensureSettingsUiPrefsLoaded } from "../settingsRuntime/prefs.js";
import {
  bindModalUiOnce,
  ensureModalSkeletonInjected,
  refreshModalDynamicSections,
} from "./modalLifecycle.js";
import { syncSettingsSidebarNavigation } from "./navigation.js";

// Base (non-feature) settings.

export async function initModalUi() {
  // Entry point for the settings modal. Responsibilities:
  // - Ensure the modal skeleton exists and event handlers are bound.
  // - Refresh dynamic sections (add-ons navigation/panels + settings sections).
  // - Initialize tags panel UI and load tags data once per session.
  await ensureSettingsUiPrefsLoaded();

  initAddonsRegistryBridge({
    onRegistryUpdate: (addons) => {
      updateRegisteredAddons(addons, {
        syncNavigation: () => {
          const sr = stateManager.get("shadowRoot");
          if (sr) syncSettingsSidebarNavigation(sr);
        },
      });
    },
  });

  const shadowRoot = ensureModalSkeletonInjected();
  if (!shadowRoot) return;

  bindModalUiOnce(shadowRoot);
  refreshModalDynamicSections(shadowRoot);
}
