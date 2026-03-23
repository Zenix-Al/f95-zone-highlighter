import { createEl } from "../../core/dom.js";

export function createLabel(meta, id) {
  const label = createEl("label", { text: meta.text });
  label.htmlFor = id;

  if (meta.tooltip) {
    label.title = meta.tooltip;

    const tooltipBadge = createEl("span", {
      className: "setting-tooltip-badge",
      text: "?",
    });
    tooltipBadge.title = meta.tooltip;
    tooltipBadge.setAttribute("aria-label", meta.tooltip);
    label.appendChild(tooltipBadge);
  }

  return label;
}
