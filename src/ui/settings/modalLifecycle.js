import { stateManager } from "../../config.js";
import { addListener } from "../../core/listenerRegistry";
import { handleModalClick, handleOutsideSearchClick } from "../components/listeners";
import { injectModal } from "../components/modal";
import {
  initAddinsPanelActions,
  updateRegisteredAddons,
} from "../components/addons/settingsController.js";
import { ensureTagsPanelDataLoaded, initTagsPanelUi } from "./tagsSettings.js";
import { renderAllSettingsSections } from "../settingsRuntime/sectionsRegistry.js";
import {
  initSettingsSidebarNavigation,
  setActivePanel,
  syncSettingsSidebarNavigation,
} from "./navigation.js";

export function ensureModalSkeletonInjected() {
  if (stateManager.get("modalInjected")) return stateManager.get("shadowRoot");

  stateManager.set("modalInjected", true);
  injectModal();
  return stateManager.get("shadowRoot");
}

export function bindModalUiOnce(shadowRoot) {
  const host = shadowRoot?.host;
  if (!shadowRoot || !host || host.dataset.settingsUiBound) return;

  initSettingsSidebarNavigation(shadowRoot);
  initAddinsPanelActions(shadowRoot, {
    setActivePanel: (panelId) => setActivePanel(shadowRoot, panelId),
    syncSettingsSidebarNavigation: () => syncSettingsSidebarNavigation(shadowRoot),
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
  updateRegisteredAddons(null, { syncNavigation: () => syncSettingsSidebarNavigation(shadowRoot) });
  syncSettingsSidebarNavigation(shadowRoot);
  renderAllSettingsSections();
  ensureTagsPanelDataLoaded();
}
