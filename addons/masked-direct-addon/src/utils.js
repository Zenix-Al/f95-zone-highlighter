import { AUTOMATION_MARKER_KEY, DIRECT_HOSTS } from "./constants.js";

export function createDebugLog(addonId) {
  return function debugLog(scope, message, extra = null) {
    if (extra) {
      console.debug(`[${addonId}:${scope}] ${message}`, extra);
    } else {
      console.debug(`[${addonId}:${scope}] ${message}`);
    }
  };
}

export function normalizeUrl(url, fallback = "") {
  const raw = String(url || "")
    .trim()
    .replace(/&amp;/gi, "&");
  if (!raw) return fallback;
  try {
    return new URL(raw, location.href).href;
  } catch {
    return fallback;
  }
}

export function withAutomationMarker(url) {
  const safe = normalizeUrl(url, "");
  if (!safe) return "";
  try {
    const parsed = new URL(safe);
    parsed.searchParams.set(AUTOMATION_MARKER_KEY, "1");
    return parsed.href;
  } catch {
    return safe;
  }
}

export function isLikelyDirectDownloadAnchor(link) {
  if (!(link instanceof HTMLAnchorElement)) return false;
  const rawHref = String(link.getAttribute("href") || "")
    .trim()
    .toLowerCase();
  if (!rawHref) return false;
  if (rawHref.startsWith("#")) return false;
  if (rawHref.startsWith("javascript:")) return false;
  if (rawHref.startsWith("mailto:")) return false;
  if (rawHref.startsWith("tel:")) return false;
  if (rawHref.startsWith("/")) return false;
  if (rawHref.startsWith("./") || rawHref.startsWith("../")) return false;
  if (rawHref.includes("f95zone.to")) return false;

  const normalized = normalizeUrl(rawHref, "");
  if (!normalized) return false;

  try {
    const host = new URL(normalized).hostname.toLowerCase();
    return DIRECT_HOSTS.some((entry) => host.includes(entry));
  } catch {
    return false;
  }
}

export function queryAllBySelectors(selectors, root = document) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  const seen = new Set();
  const result = [];
  for (const selector of list) {
    if (!selector || typeof selector !== "string") continue;
    const nodes = root.querySelectorAll(selector);
    for (const node of nodes) {
      if (seen.has(node)) continue;
      seen.add(node);
      result.push(node);
    }
  }
  return result;
}

export function queryFirstBySelectors(selectors, root = document) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const selector of list) {
    if (!selector || typeof selector !== "string") continue;
    const node = root.querySelector(selector);
    if (node) return node;
  }
  return null;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
