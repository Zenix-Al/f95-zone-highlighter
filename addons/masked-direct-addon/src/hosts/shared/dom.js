export function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isElementVisible(element) {
  if (!element || !element.isConnected) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

export function isElementDisabled(element) {
  if (!element) return true;
  if (element.disabled) return true;
  const ariaDisabled = String(element.getAttribute("aria-disabled") || "").toLowerCase();
  return ariaDisabled === "true";
}

export function isElementReadyForClick(element) {
  return Boolean(element && element.isConnected && !isElementDisabled(element));
}

export function getElementText(element) {
  return normalizeText(element?.textContent || element?.value || element?.getAttribute?.("title"));
}

export function isCountdownText(text) {
  return /\b\d+\s*s\b/.test(normalizeText(text));
}
