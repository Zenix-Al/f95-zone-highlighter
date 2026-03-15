function normalizeSelectorList(selectors) {
  if (typeof selectors === "string") {
    return selectors.trim() ? [selectors.trim()] : [];
  }
  if (!Array.isArray(selectors)) return [];
  return selectors
    .map((selector) => (typeof selector === "string" ? selector.trim() : ""))
    .filter(Boolean);
}

export function queryFirstBySelectors(selectors, root = document) {
  if (!root || typeof root.querySelector !== "function") return null;
  const selectorList = normalizeSelectorList(selectors);
  for (const selector of selectorList) {
    try {
      const match = root.querySelector(selector);
      if (match) return match;
    } catch {
      // Ignore invalid selectors and continue with next fallback.
    }
  }
  return null;
}

export function queryAllBySelectors(selectors, root = document) {
  if (!root || typeof root.querySelectorAll !== "function") return [];
  const selectorList = normalizeSelectorList(selectors);
  for (const selector of selectorList) {
    try {
      const matches = Array.from(root.querySelectorAll(selector));
      if (matches.length > 0) return matches;
    } catch {
      // Ignore invalid selectors and continue with next fallback.
    }
  }
  return [];
}

