
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
    const parsed = new URL(raw, location.href);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : fallback;
  } catch {
    return fallback;
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
