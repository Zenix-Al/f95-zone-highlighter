import { config } from "../../constants";
import { getByPath, setByPath } from "../../features/rendererHelper";
import { saveConfigKeys } from "../save";
import { applyEffects } from "./applyEffects";
import { createInput } from "./createInput";
import { createLabel } from "./createLabel";

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
    const newValue = meta.type === "toggle" ? input.checked : input.value;

    const keyName = setByPath(config, meta.config, newValue);

    saveConfigKeys({
      [keyName]: config[keyName],
    });

    applyEffects(meta, newValue);
  });

  row.appendChild(label);
  row.appendChild(input);

  return row;
}
