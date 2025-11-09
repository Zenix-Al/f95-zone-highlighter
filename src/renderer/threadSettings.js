import { config, state } from "../constants";
import { saveConfigKeys } from "../storage/save";
import { showToast } from "../ui/modal";
import { updateColorStyle } from "./updateColorStyle";

export function renderThreadSettings() {
  const container = document.getElementById("thread-settings-container");
  container.innerHTML = ""; // clear old

  Object.entries(config.threadSettings).forEach(([key, value]) => {
    const row = document.createElement("div");
    row.className = "config-row";

    const label = document.createElement("label");
    label.setAttribute("for", `thread-settings-${key}`);
    label.textContent = key.charAt(0).toUpperCase() + key.slice(1); // capitalize

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `thread-settings-${key}`;
    checkbox.checked = value;

    // update config + toast
    checkbox.addEventListener("change", (e) => {
      config.threadSettings[key] = e.target.checked;
      saveConfigKeys({ threadSettings: config.threadSettings });
      showToast(`${key} ${e.target.checked ? "enabled" : "disabled"}`);
      state.reapplyOverlay = true;
      updateColorStyle();
    });

    row.appendChild(label);
    row.appendChild(checkbox);
    container.appendChild(row);
  });
}
