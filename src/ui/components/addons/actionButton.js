import { createEl } from "../../../core/dom.js";

export function createActionButton(doc, text, action, addonId, extraClass = "") {
  return createEl("button", {
    className: `addins-action-btn${extraClass ? ` ${extraClass}` : ""}`,
    text,
    attrs: {
      type: "button",
      "data-addon-action": action,
      "data-addon-id": addonId,
    },
    mount: doc,
  });
}
