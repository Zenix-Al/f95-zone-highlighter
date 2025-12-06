import { config, state } from "../constants";
import { saveConfigKeys } from "../storage/save";
import { showToast } from "../ui/modal";
import { overlaySettingsText, overlaySettingsTooltip } from "../constants";

export function renderOverlaySettings() {
  const container = document.getElementById("overlay-settings-container");
  if (!container) return;

  container.innerHTML = ""; // Clear previous content

  Object.keys(config.overlaySettings).forEach((key) => {
    const enabled = config.overlaySettings[key];

    const row = document.createElement("div");
    row.className = "config-row";

    // Checkbox input
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = `overlay-setting-${key}`;
    input.checked = enabled;
    input.className = "config-checkbox";

    // Label with human-readable text
    const label = document.createElement("label");
    label.setAttribute("for", input.id);
    label.textContent = overlaySettingsText[key] || key; // fallback if missing
    label.className = "config-label";

    // Add tooltip if available
    const tooltip = overlaySettingsTooltip?.[key];
    if (tooltip) {
      label.title = tooltip;
    }

    // Change handler
    input.addEventListener("change", (e) => {
      const newValue = e.target.checked;
      config.overlaySettings[key] = newValue;

      const displayName = overlaySettingsText[key] || key;
      const status = newValue ? "enabled" : "disabled";

      saveConfigKeys({ overlaySettings: config.overlaySettings });
      state.reapplyOverlay = true;

      showToast(`${displayName} ${status}`);
    });

    // Append in nice order: checkbox first (for better click area), then label
    row.appendChild(label);
    row.appendChild(input);
    container.appendChild(row);
  });
}
