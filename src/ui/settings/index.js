import stateManager from "../../config.js";
import {
  initTagSearchListeners,
  renderExcluded,
  renderPreferred,
} from "../components/tag-search/index.js";
import { renderSettingsSection } from "../renderers/settingsSection";
import { handleModalClick, handleOutsideSearchClick } from "../components/listeners";
import { injectModal } from "../components/modal";
import { addListener } from "../../core/listenerRegistry";
import { showToast } from "../components/toast";
import { colorSettingsMeta } from "./colorSettings";
import { globalSettingsMeta } from "./globalSettings";
import { latestSettingsMeta } from "./latestSettings";
import { threadSettingsMeta } from "./threadSettings";
import { showAllTags, updateSearch, updateTags } from "../../services/tagsService";
import { checkTags } from "../../services/safetyService";

export function initModalUi() {
  if (!stateManager.get("modalInjected")) {
    stateManager.set("modalInjected", true);
    injectModal();

    // --- Set up one-time listeners for the modal ---
    const shadowRoot = stateManager.get("shadowRoot");
    if (!shadowRoot) return; // Should not happen if modal was injected

    // Listeners for the tag search input
    const searchInput = shadowRoot.getElementById("tags-search");
    if (searchInput) {
      addListener("tags-search-input", searchInput, "input", updateSearch);
      addListener("tags-search-focus", searchInput, "focus", showAllTags);
    }

    // Initialize delegated listeners for tag search results and tag lists
    initTagSearchListeners();

    // Main delegated click listener for modal buttons (close, reset, etc.)
    const modal = shadowRoot.getElementById("tag-config-modal");
    if (modal) addListener("modal-delegated-click", modal, "click", handleModalClick);

    // Listener to close search results when clicking outside
    addListener("outside-search-click", document, "click", handleOutsideSearchClick);
  }
  if (!stateManager.get("globalSettingsRendered")) {
    stateManager.set("globalSettingsRendered", true);
    renderSettingsSection("global-settings-container", globalSettingsMeta);
  }
  if (!stateManager.get("colorRendered")) {
    stateManager.set("colorRendered", true);
    renderSettingsSection("color-container", colorSettingsMeta);
  }
  if (!stateManager.get("overlayRendered")) {
    stateManager.set("overlayRendered", true);
    updateLatestUI();
  }
  if (!stateManager.get("threadSettingsRendered")) {
    stateManager.set("threadSettingsRendered", true);
    updateThreadUI();
  }

  // Kick off the tag update process using async/await in a detached task.
  (async () => {
    try {
      const result = await updateTags();
      if (result?.pruned && result.count > 0) {
        showToast(`${result.count} obsolete tag(s) removed from your lists.`);
      }
      renderPreferred();
      renderExcluded();
      checkTags();
    } catch (err) {
      // best-effort: don't block UI on errors
      console.warn("updateTags failed:", err);
    }
  })();
}

export function updateLatestUI() {
  renderSettingsSection("latest-settings-container", latestSettingsMeta);
}

export function updateThreadUI() {
  renderSettingsSection("thread-settings-container", threadSettingsMeta);
}
