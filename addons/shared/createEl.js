export function createEl(tag, className = "", textContent = "", id = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (textContent) el.textContent = textContent;
  if (id) el.id = id;
  return el;
}
