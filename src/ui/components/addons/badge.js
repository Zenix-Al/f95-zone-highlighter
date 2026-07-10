import { createEl } from "../../../utils/dom.js";

export function createBadge(doc, text, className = "") {
  return createEl("span", {
    className: `addins-badge${className ? ` ${className}` : ""}`,
    text,
    mount: doc,
  });
}
