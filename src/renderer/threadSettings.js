import { config, state, threadSettingsText, threadSettingsTooltip } from "../constants";
import { saveConfigKeys } from "../storage/save";
import { showToast } from "../ui/modal";
import { updateColorStyle } from "./updateColorStyle";

export function renderThreadSettings() {
  const container = document.getElementById("thread-settings-container");
  if (!container) return;

  container.innerHTML = ""; // Clear previous content

  Object.entries(config.threadSettings).forEach(([key, value]) => {
    const row = document.createElement("div");
    row.className = "config-row";

    // Checkbox
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `thread-setting-${key}`;
    checkbox.checked = value;
    checkbox.className = "config-checkbox";

    // Label with readable text
    const label = document.createElement("label");
    label.setAttribute("for", checkbox.id);
    label.textContent = threadSettingsText[key] || key.charAt(0).toUpperCase() + key.slice(1);
    label.className = "config-label";

    // Add tooltip if exists
    const tooltip = threadSettingsTooltip?.[key];
    if (tooltip) {
      label.title = tooltip;
    }

    // Change handler
    checkbox.addEventListener("change", (e) => {
      const isEnabled = e.target.checked;
      config.threadSettings[key] = isEnabled;

      const displayName = threadSettingsText[key] || key;
      const status = isEnabled ? "enabled" : "disabled";

      saveConfigKeys({ threadSettings: config.threadSettings });
      showToast(`${displayName} ${status}`);

      state.reapplyOverlay = true;
      updateColorStyle();
    });

    // Append: checkbox first → bigger click area + better accessibility
    row.appendChild(label);
    row.appendChild(checkbox);
    container.appendChild(row);
  });
}
