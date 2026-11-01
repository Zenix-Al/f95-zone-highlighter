export function isAutomationEnabled(settings) {
  return (
    settings?.enabled === true &&
    settings.automateRegardless === true &&
    settings.needsSettingsRefresh !== true
  );
}

export function createDebugLog(addonId) {
  return function debugLog(scope, message, extra = null) {
    if (extra) {
      console.debug(`[${addonId}:${scope}] ${message}`, extra);
    } else {
      console.debug(`[${addonId}:${scope}] ${message}`);
    }
  };
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

export function sleep(ms, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
