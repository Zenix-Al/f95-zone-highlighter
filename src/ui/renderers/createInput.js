import { attachDarkColorPicker } from "../components/darkColorPicker.js";

export function createInput(meta, id) {
  const input = document.createElement("input");
  input.id = id;

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

    default:
      throw new Error(`Unknown input type: ${meta.type}`);
  }

  return input;
}
