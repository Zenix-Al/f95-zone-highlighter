import { config, defaultColors, state } from "../constants";
import { autoRefreshClick, webNotifClick } from "../cores/thread";
import { renderColorConfig } from "../renderer/color";
import { renderList } from "../renderer/searchTags";
import { updateColorStyle } from "../renderer/updateColorStyle";
import { saveConfigKeys } from "../storage/save";
import { openModal, closeModal, showToast, updateButtonVisibility } from "./modal";
export function injectListener() {
  setEventById("tag-config-button", openModal);
  setEventById("close-modal", closeModal);
  setEventById("tags-search", updateSearch, "input");
  setEventById("tags-search", showAllTags, "focus");
  setEventById("config-visibility", updateConfigVisibility);
  setEventById("rese-color", resetColor);
  setEventById("min-version", updateMinVersion, "change");
  setEventById("settings-auto-refresh", updateAutoRefresh);
  setEventById("settings-web-notif", updateWebNotif);
  setEventById("settings-script-notif", updateScriptNotif());
  document.addEventListener("click", (e) => {
    const input = document.getElementById("tags-search");
    const results = document.getElementById("search-results");
    if (!input || !results) return;

    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.style.display = "none";
    }
  });
}
export function setEventById(idSelector, callback, eventType = "click") {
  const el = document.getElementById(idSelector);
  if (el) {
    el.addEventListener(eventType, callback);
  } else {
    console.warn(`setEventById: element with id "${idSelector}" not found.`);
  }
}

export function updateSearch(event) {
  const query = event.target.value.trim().toLowerCase();
  const results = document.getElementById("search-results");

  if (!query || !results) {
    if (results) results.style.display = "none";
    return;
  }

  const filteredTags = config.tags.filter((tag) => tag.name.toLowerCase().includes(query));

  renderList(filteredTags);
}
export function showAllTags() {
  const results = document.getElementById("search-results");
  if (!results) return;
  renderList(config.tags);
  results.style.display = "block";
}

export function updateColor(event, key) {
  const newValue = event.target.value;
  showToast("color saved successfully!");
  config.color[key] = newValue;
  updateColorStyle();
  saveConfigKeys({ color: config.color });
  state.reapplyOverlay = true;
}

export function updateConfigVisibility(event) {
  config.configVisibility = event.target.checked;
  saveConfigKeys({ configVisibility: config.configVisibility });
  showToast("config visibility saved!");
  updateButtonVisibility();
}
export function updateMinVersion(event) {
  const valueStr = event.target?.value ?? event.value;
  const value = parseFloat(valueStr);

  if (isNaN(value)) {
    showToast("Invalid version: must be a number");
    return;
  }

  config.minVersion = value;
  saveConfigKeys({ minVersion: config.minVersion });
  showToast(`Min version changed to ${config.minVersion}`);
  state.reapplyOverlay = true;
}

export function resetColor() {
  if (confirm("Are you sure you want to reset all colors to default?")) {
    config.color = { ...defaultColors };
    updateColorStyle();
    renderColorConfig();
    saveConfigKeys({ color: config.color });
    showToast("Colors have been reset to default");
    state.reapplyOverlay = true;
  }
}

export function updateAutoRefresh(event) {
  config.latestSettings.autoRefresh = event.target.checked;
  if (!event.target.checked) {
    config.latestSettings.webNotif = false;
    const notif = document.getElementById("settings-web-notif");
    if (notif) notif.checked = false;
  }

  saveConfigKeys({ latestSettings: config.latestSettings });
  const message = event.target.checked ? "Auto refresh enabled" : "Auto refresh disabled";

  showToast(message);
  autoRefreshClick();
}

export function updateWebNotif(event) {
  const autoRefresh = document.getElementById("settings-auto-refresh");
  if (!autoRefresh.checked) {
    showToast("auto refresh is disabled");
    event.target.checked = false;
    return;
  }
  config.latestSettings.webNotif = event.target.checked;
  saveConfigKeys({ latestSettings: config.latestSettings });

  const message = event.target.checked
    ? "Browser notifications enabled"
    : "Browser notifications disabled";

  showToast(message);
  webNotifClick();
}

export function updateScriptNotif() {}
