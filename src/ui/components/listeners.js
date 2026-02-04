import { config, defaultColors, state } from "../../config";
import { showAllTags, updateSearch } from "../../services/tagsService";
import { queuedProcessAllTilesReset, queuedProcessThreadTags } from "../../core/tasksRegistry";
import { colorSettingsMeta } from "../settings/colorSettings";
import { reRenderSettingsSection } from "../settings/reRenderSetting";
import { updateColorStyle } from "../settings/updateColorStyle";
import { saveConfigKeys } from "../../services/settingsService";
import { closeModal, showToast } from "./modal";

/**
 * this file contain is legacy code, carefully migrate functions one by one
 */
export function injectListener() {
  setEventById("tags-search", updateSearch, "input");
  setEventById("close-modal", closeModal);
  setEventById("tags-search", showAllTags, "focus");
  setEventById("reset-color", resetColor);
  //setEventById("settings-script-notif", updateScriptNotif());
  document.addEventListener("click", (e) => {
    if (!state.shadowRoot) return;
    const input = state.shadowRoot.getElementById("tags-search");
    const results = state.shadowRoot.getElementById("search-results");
    if (!input || !results) return;

    // Use composedPath to correctly detect clicks inside/outside the shadow DOM
    const path = e.composedPath();
    if (!path.includes(input) && !path.includes(results)) {
      results.style.display = "none";
    }
  });
}
export function setEventById(idSelector, callback, eventType = "click") {
  const el = state.shadowRoot.getElementById(idSelector);
  if (el) {
    el.addEventListener(eventType, callback);
  } else {
    console.warn(`setEventById: element with id "${idSelector}" not found.`);
  }
}

export function resetColor() {
  if (confirm("Are you sure you want to reset all colors to default?")) {
    config.color = { ...defaultColors };
    updateColorStyle();
    saveConfigKeys({ color: config.color });

    if (config.latestSettings.latestOverlayToggle && state.isLatest) {
      queuedProcessAllTilesReset();
    } else if (config.threadSettings.threadOverlayToggle && state.isThread) {
      queuedProcessThreadTags();
    }
    reRenderSettingsSection("color-container", colorSettingsMeta);
    showToast("Colors have been reset to default");
  }
}
