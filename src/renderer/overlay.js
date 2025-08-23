import { config, state } from "../constants";
import { saveConfigKeys } from "../storage/save";
import { showToast } from "../ui/modal";

export function renderOverlaySettings() {
  const container = document.getElementById("overlay-settings-container");
  container.innerHTML = ""; // clear old content

  Object.keys(config.overlaySettings).forEach((key) => {
    const row = document.createElement("div");
    row.className = "config-row";

    const label = document.createElement("label");
    label.setAttribute("for", `tag-settings-${key}`);
    label.textContent = key.charAt(0).toUpperCase() + key.slice(1);

    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = `tag-settings-${key}`;
    input.checked = config.overlaySettings[key]; // set initial state

    // optional: update config when toggled
    input.addEventListener("change", (e) => {
      config.overlaySettings[key] = e.target.checked;
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      const st = e.target.checked ? "enabled" : "disabled";
      saveConfigKeys({ overlaySettings: config.overlaySettings });
      state.reapplyOverlay = true;
      showToast(`${label} ${st}`);
    });

    row.appendChild(label);
    row.appendChild(input);
    container.appendChild(row);
  });
}
