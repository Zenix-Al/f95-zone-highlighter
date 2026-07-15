import { stateManager } from "../../config";
import { addListener } from "../../core/listenerRegistry";
import { checkTags } from "../../services/safetyService";
import { showAllTags, updateSearch, updateTags } from "../../services/tagsService";
import {
  initTagSearchListeners,
  renderExcluded,
  renderMarked,
  renderPreferred,
} from "../components/tag-search";
import { showToast } from "../components/toast";
import {
  reprocessLatestTilesAfterSettingsChange,
  refreshThreadOverlayAfterSettingsChange,
} from "../settingsRuntime/effectTasks.js";
import {
  getSettingsMetadataByOwner,
  registerSettingsMetadata,
} from "../settings/metaRegistry.js";

function applyTagConfigEffects() {
  reprocessLatestTilesAfterSettingsChange();
  refreshThreadOverlayAfterSettingsChange();
}

if (getSettingsMetadataByOwner("base:tags").length === 0) {
  registerSettingsMetadata("tags", {
    preferredTags: { config: "preferredTags", effects: { custom: applyTagConfigEffects } },
    excludedTags: { config: "excludedTags", effects: { custom: applyTagConfigEffects } },
    markedTags: { config: "markedTags", effects: { custom: applyTagConfigEffects } },
  }, "base:tags");
}

export function initTagsPanelUi(shadowRoot) {
  if (!shadowRoot) return;

  const searchInput = shadowRoot.getElementById("tags-search");
  if (searchInput) {
    addListener("tags-search-input", searchInput, "input", updateSearch);
    addListener("tags-search-focus", searchInput, "focus", (e) => {
      if (e.target.value.trim()) {
        updateSearch(e);
      } else {
        showAllTags();
      }
    });
  }

  initTagSearchListeners();
}

export function ensureTagsPanelDataLoaded() {
  if (stateManager.get("tagsUpdateRan")) return;
  stateManager.set("tagsUpdateRan", true);

  (async () => {
    try {
      const result = await updateTags();
      if (result?.pruned && result.count > 0) {
        showToast(`${result.count} obsolete tag(s) removed from your lists.`);
      }
      renderPreferred();
      renderExcluded();
      renderMarked();
      checkTags();
    } catch (err) {
      console.warn("updateTags failed:", err);
    }
  })();
}
