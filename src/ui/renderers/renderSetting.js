import { config } from "../../config.js";
import { saveConfigKeys } from "../../services/settingsService";
import { applyEffects } from "./applyEffects";
import { createInput } from "./createInput";
import { createLabel } from "./createLabel";
import { coerceSettingValue } from "./coerceSettingValue.js";
import { getByPath, setByPath } from "../../utils/objectPath.js";
import { createEl } from "../../utils/dom.js";

export function renderSetting(key, meta) {
  if (meta.type === "header") {
    return createEl("div", { className: "config-header", text: meta.text });
  }

  if (meta.type === "separator") {
    return createEl("hr", { className: "config-separator" });
  }

  if (meta.type === "info") {
    const row = createEl("div", { className: `config-info ${meta.className || ""}`.trim() });
    row.setAttribute("role", "note");
    if (meta.tooltip) row.title = meta.tooltip;
    row.appendChild(createEl("p", { text: meta.description || meta.text || "" }));
    return row;
  }

  if (meta.type === "button") {
    const row = createEl("div", { className: "config-row" });
    row.dataset.settingKey = key;

    const label = createLabel(meta, `setting-${key}`);
    const btn = createEl("button", {
      className: "config-button",
      text: meta.buttonText || meta.text || "Action",
    });
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

  // â¬‡ï¸ existing input renderer stays untouched
  const row = createEl("div", { className: "config-row" });
  row.dataset.settingKey = key;

  const id = `setting-${key}`;

  const label = createLabel(meta, id);
  const input = createInput(meta, id);
  const value = getByPath(config, meta.config);

  if (meta.type === "toggle") {
    input.checked = Boolean(value);
  } else {
    input.value = value;
    if (meta.type === "color") {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  input.addEventListener("change", async () => {
    const rawValue = meta.type === "toggle" ? input.checked : input.value;
    const previousValue = getByPath(config, meta.config);
    const newValue = coerceSettingValue(meta, rawValue, previousValue);

    if (typeof meta.beforeChange === "function") {
      let allowed = true;
      try {
        const decision = await meta.beforeChange({
          key,
          meta,
          input,
          previousValue,
          nextValue: newValue,
        });
        allowed = decision !== false;
      } catch (err) {
        console.warn("beforeChange hook failed:", err);
        allowed = false;
      }

      if (!allowed) {
        if (meta.type === "toggle") {
          input.checked = Boolean(previousValue);
        } else {
          input.value = String(previousValue ?? "");
        }
        return;
      }
    }

    if (meta.type === "toggle") {
      input.checked = Boolean(newValue);
    } else {
      input.value = String(newValue);
    }

    const didSet = setByPath(config, meta.config, newValue);
    if (!didSet) {
      return;
    }

    const topLevelKey = meta.config.split(".")[0];
    saveConfigKeys({
      [topLevelKey]: config[topLevelKey],
    });

    void applyEffects(meta, newValue);
  });

  row.appendChild(label);
  row.appendChild(input);

  return row;
}
