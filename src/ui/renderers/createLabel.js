export function createLabel(meta, id) {
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = meta.text;

  if (meta.tooltip) {
    label.title = meta.tooltip;

    const tooltipBadge = document.createElement("span");
    tooltipBadge.className = "setting-tooltip-badge";
    tooltipBadge.textContent = "?";
    tooltipBadge.title = meta.tooltip;
    tooltipBadge.setAttribute("aria-label", meta.tooltip);
    label.appendChild(tooltipBadge);
  }

  return label;
}
