function normalizeSelectorList(selectors) {
  if (typeof selectors === "string") {
    return selectors.trim() ? [selectors.trim()] : [];
  }
  if (!Array.isArray(selectors)) return [];
  return selectors
    .map((selector) => (typeof selector === "string" ? selector.trim() : ""))
    .filter(Boolean);
}

export function queryFirstBySelectors(selectors, root = document, options = {}) {
  if (!root || typeof root.querySelector !== "function") return null;
  const selectorList = normalizeSelectorList(selectors);
  for (let index = 0; index < selectorList.length; index += 1) {
    const selector = selectorList[index];
    try {
      const match = root.querySelector(selector);
      if (match) {
        recordSelectorDiagnostic({ key: options.key || selector, required: Boolean(options.required), fallbackUsed: index > 0, matched: true, routeContext: options.routeContext });
        return match;
      }
    } catch {
      // Ignore invalid selectors and continue with next fallback.
    }
  }
  recordSelectorDiagnostic({ key: options.key || selectorList[0] || "unknown", required: Boolean(options.required), fallbackUsed: false, matched: false, routeContext: options.routeContext });
  return null;
}

export function queryAllBySelectors(selectors, root = document, options = {}) {
  if (!root || typeof root.querySelectorAll !== "function") return [];
  const selectorList = normalizeSelectorList(selectors);
  for (let index = 0; index < selectorList.length; index += 1) {
    const selector = selectorList[index];
    try {
      const matches = Array.from(root.querySelectorAll(selector));
      if (matches.length > 0) {
        recordSelectorDiagnostic({ key: options.key || selector, required: Boolean(options.required), fallbackUsed: index > 0, matched: true, routeContext: options.routeContext });
        return matches;
      }
    } catch {
      // Ignore invalid selectors and continue with next fallback.
    }
  }
  recordSelectorDiagnostic({ key: options.key || selectorList[0] || "unknown", required: Boolean(options.required), fallbackUsed: false, matched: false, routeContext: options.routeContext });
  return [];
}

import { recordSelectorDiagnostic } from "../core/featureHealth.js";
