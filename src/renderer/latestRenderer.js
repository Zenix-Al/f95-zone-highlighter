import { config, state, latestSettingsText, latestSettingsTooltip } from "../constants";
import { saveConfigKeys } from "../storage/save";
import { showToast } from "../ui/modal";

export function renderLatestSettings() {
  const container = document.getElementById("latest-settings-warning");
  if (!container) return;

  // Clear and use the parent wrapper (we'll inject into it)
  const wrapper = container.parentElement; // .settings-wrapper
  const existingContainer = document.getElementById("latest-settings-container");
  if (existingContainer) existingContainer.remove();

  const settingsContainer = document.createElement("div");
  settingsContainer.id = "latest-settings-container";

  // === Auto Refresh ===
  createCheckbox("autoRefresh", latestSettingsText.autoRefresh, latestSettingsTooltip.autoRefresh);

  // === Web Notifications ===
  createCheckbox("webNotif", latestSettingsText.webNotif, latestSettingsTooltip.webNotif);

  // === Min Version (number input) ===
  createNumberInput();

  wrapper.insertBefore(settingsContainer, document.getElementById("overlay-settings-container"));

  // Helper: Create checkbox row
  function createCheckbox(key, labelText, tooltip) {
    const row = document.createElement("div");
    row.className = "config-row";

    const label = document.createElement("label");
    label.textContent = labelText;
    label.title = tooltip || "";
    label.htmlFor = `latest-${key}`;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = `latest-${key}`;
    input.checked = !!config.latestSettings[key];

    input.addEventListener("change", (e) => {
      config.latestSettings[key] = e.target.checked;
      saveConfigKeys({ latestSettings: config.latestSettings });
      showToast(`${labelText} ${e.target.checked ? "enabled" : "disabled"}`);
      state.reapplyLatest = true;
    });

    row.appendChild(label);
    row.appendChild(input);
    settingsContainer.appendChild(row);
  }

  // Helper: Min Version number input
  function createNumberInput() {
    const row = document.createElement("div");
    row.className = "config-row";

    const label = document.createElement("label");
    label.textContent = latestSettingsText.minVersion;
    label.title = latestSettingsTooltip.minVersion;
    label.htmlFor = "latest-min-version";

    const input = document.createElement("input");
    input.type = "number";
    input.id = "latest-min-version";
    input.step = "0.1";
    input.min = "0";
    input.value = config.latestSettings.minVersion;

    input.addEventListener("change", (e) => {
      const val = parseFloat(e.target.value) || 0;
      config.latestSettings.minVersion = val;
      saveConfigKeys({ latestSettings: config.latestSettings });
      showToast(`Min Version set to ${val}`);
      state.reapplyLatest = true;
    });

    row.appendChild(label);
    row.appendChild(input);
    settingsContainer.appendChild(row);
  }
}
