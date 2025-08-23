import { config, defaultColors } from "../constants";
import { saveConfigKeys } from "../storage/save";
import { setEventById, updateColor } from "../ui/listeners";
export function renderColorConfig() {
  const container = document.getElementById("color-container");
  if (!container) return;

  // Clear previous content
  container.innerHTML = "";

  Object.entries(config.color).forEach(([key, value]) => {
    // Add a horizontal line before "preferred"
    if (key === "preferred") {
      const hr = document.createElement("hr");
      hr.className = "thick-line";
      container.appendChild(hr);
    }

    // Create row container
    const row = document.createElement("div");
    row.className = "config-row";

    // Create label
    const label = document.createElement("label");
    label.setAttribute("for", `color-${key}`);
    label.textContent = key.charAt(0).toUpperCase() + key.slice(1) + ":";

    // Create input
    const input = document.createElement("input");
    input.type = "color";
    input.id = `color-${key}`;
    input.className = "config-color-input";
    input.value = value;

    // Append label and input to row
    row.appendChild(label);
    row.appendChild(input);

    // Append row to container
    container.appendChild(row);
    setEventById(`color-${key}`, (event) => updateColor(event, key), "change");
  });
}

export function resetColor() {
  config.color = { ...defaultColors };

  saveConfigKeys({ color: config.color });

  renderColorConfig();
}
