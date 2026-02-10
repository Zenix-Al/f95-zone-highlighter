export function createLabel(meta, id) {
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = meta.text;

  if (meta.tooltip) {
    label.title = meta.tooltip;
  }

  return label;
}
