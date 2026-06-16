import { stateManager } from "../../config.js";
import { addListener } from "../../core/listenerRegistry";
import { handleModalClick, handleOutsideSearchClick } from "../components/listeners";
import { injectModal } from "../components/modal";
import {
  getPinnedAddonIds,
  getRegisteredAddons,
  initAddinsPanelActions,
  updateRegisteredAddons,
} from "../components/addons/settingsController.js";
import { refreshAddonsUi } from "../renderers/addonsRenderer.js";
import { ensureTagsPanelDataLoaded, initTagsPanelUi } from "./tagsSettings.js";
import { renderAllSettingsSections } from "../settingsRuntime/sectionsRegistry.js";
import {
  initSettingsPanelNavigation,
  setActivePanel,
  syncActiveSettingsPanel,
} from "./panelNavigation.js";

export function ensureModalSkeletonInjected() {
  if (stateManager.get("modalInjected")) return stateManager.get("shadowRoot");

  stateManager.set("modalInjected", true);
  injectModal();
  return stateManager.get("shadowRoot");
}

export function refreshModalAddonsUi(shadowRoot) {
  refreshAddonsUi(shadowRoot, {
    getRegisteredAddons,
    getPinnedAddonIds,
    syncActiveSettingsPanel,
  });
}

export function bindModalUiOnce(shadowRoot) {
  const host = shadowRoot?.host;
  if (!shadowRoot || !host || host.dataset.settingsUiBound) return;

  initSettingsPanelNavigation(shadowRoot);
  initAddinsPanelActions(shadowRoot, {
    setActivePanel: (panelId) => setActivePanel(shadowRoot, panelId),
    refreshAddonsUi: () => refreshModalAddonsUi(shadowRoot),
  });

  initTagsPanelUi(shadowRoot);

  const modal = shadowRoot.getElementById("tag-config-modal");
  if (modal) {
    addListener("modal-delegated-click", modal, "click", handleModalClick);
  }

  addListener("outside-search-click", document, "click", handleOutsideSearchClick);
  host.dataset.settingsUiBound = "1";
}

export function refreshModalDynamicSections(shadowRoot) {
  if (!shadowRoot) return;
  updateRegisteredAddons(null, { refreshAddonsUi: () => refreshModalAddonsUi(shadowRoot) });
  renderAllSettingsSections();
  ensureTagsPanelDataLoaded();
}
