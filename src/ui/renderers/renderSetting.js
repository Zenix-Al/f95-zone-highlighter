import { config } from "../../config.js";
import { saveConfigKeys } from "../../services/settingsService";
import { applyEffects } from "./applyEffects";
import { createInput } from "./createInput";
import { createLabel } from "./createLabel";
import { coerceSettingValue } from "./coerceSettingValue.js";
import { getByPath, setByPath } from "../../utils/objectPath.js";

export function renderSetting(key, meta) {
  if (meta.type === "header") {
    const header = document.createElement("div");
    header.className = "config-header";
    header.textContent = meta.text;
    return header;
  }

  if (meta.type === "separator") {
    const hr = document.createElement("hr");
    hr.className = "config-separator";
    return hr;
  }

  if (meta.type === "button") {
    const row = document.createElement("div");
    row.className = "config-row";

    const label = createLabel(meta, `setting-${key}`);
    const btn = document.createElement("button");
    btn.className = "config-button";
    btn.textContent = meta.buttonText || meta.text || "Action";
    btn.title = meta.tooltip || "";
    btn.addEventListener("click", async () => {
      try {
        if (typeof meta.onClick === "function") {
          await meta.onClick();
        } else if (meta.effects && typeof meta.effects.custom === "function") {
          await meta.effects.custom();
        }
      } catch (err) {
        console.error("Action failed:", err);
      }
    });

    row.appendChild(label);
    row.appendChild(btn);
    return row;
  }

  // ⬇️ existing input renderer stays untouched
  const row = document.createElement("div");
  row.className = "config-row";

  const id = `setting-${key}`;

  const label = createLabel(meta, id);
  const input = createInput(meta, id);
  const value = getByPath(config, meta.config);

  if (meta.type === "toggle") {
    input.checked = Boolean(value);
  } else {
    input.value = value;
  }

  input.addEventListener("change", () => {
    const rawValue = meta.type === "toggle" ? input.checked : input.value;
    const previousValue = getByPath(config, meta.config);
    const newValue = coerceSettingValue(meta, rawValue, previousValue);

    if (meta.type === "toggle") {
      input.checked = Boolean(newValue);
    } else {
      input.value = String(newValue);
    }

    setByPath(config, meta.config, newValue);

    const topLevelKey = meta.config.split(".")[0];
    saveConfigKeys({
      [topLevelKey]: config[topLevelKey],
    });

    applyEffects(meta, newValue);
  });

  row.appendChild(label);
  row.appendChild(input);

  return row;
}
