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
  const ariaDisabled = String(
    element.getAttribute("aria-disabled") || "",
  ).toLowerCase();
  return ariaDisabled === "true";
}

export function isElementReadyForClick(element) {
  return Boolean(element && element.isConnected && !isElementDisabled(element));
}

export function getElementText(element) {
  return normalizeText(
    element?.textContent || element?.value || element?.getAttribute?.("title"),
  );
}

export function isCountdownText(text) {
  return /\b\d+\s*s\b/.test(normalizeText(text));
}

export function getElementAttributeUrl(
  element,
  attributeNames,
  baseUrl = location.href,
) {
  const names = Array.isArray(attributeNames)
    ? attributeNames
    : [attributeNames];
  for (const name of names) {
    const value = String(element?.getAttribute?.(name) || "").trim();
    if (!value || value === "#") continue;
    try {
      return new URL(value, baseUrl).href;
    } catch {
      // try the next attribute
    }
  }
  return "";
}

export function getAnchorHref(anchor, baseUrl = location.href) {
  if (!(anchor instanceof HTMLAnchorElement)) return "";
  return getElementAttributeUrl(anchor, "href", baseUrl);
}

export function clickElement(element) {
  if (!element || !element.isConnected) return false;
  try {
    HTMLElement.prototype.click.call(element);
    return true;
  } catch {
    try {
      element.click?.();
      return true;
    } catch {
      return false;
    }
  }
}

export async function waitForCandidate({
  getCandidate,
  timeoutMs,
  intervalMs = 250,
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const candidate = getCandidate();
    if (candidate) return candidate;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}
