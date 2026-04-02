import { attachDarkColorPicker } from "../components/darkColorPicker.js";
import { createEl } from "../../core/dom.js";

export function createInput(meta, id) {
  const input = createEl("input", { attrs: { id }, className: meta.className });

  switch (meta.type) {
    case "toggle":
      input.type = "checkbox";
      break;

    case "number":
      input.type = "number";
      Object.assign(input, meta.input);
      break;

    case "color":
      attachDarkColorPicker(input);
      break;

    case "select": {
      const select = createEl("select", { attrs: { id }, className: meta.className });
      const options = Array.isArray(meta.options) ? meta.options : [];
      options.forEach((opt) => {
        const value = opt && typeof opt === "object" ? opt.key : String(opt);
        const label = opt && typeof opt === "object" && opt.label ? opt.label : String(opt);
        const optionEl = document.createElement("option");
        optionEl.value = value;
        optionEl.textContent = label;
        select.appendChild(optionEl);
      });
      return select;
    }

    default:
      throw new Error(`Unknown input type: ${meta.type}`);
  }

  return input;
}
