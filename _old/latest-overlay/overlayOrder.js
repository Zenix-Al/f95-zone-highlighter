export const OVERLAY_COLOR_ORDER_KEYS = Object.freeze([
  "excluded",
  "preferred",
  "completed",
  "onhold",
  "abandoned",
  "highVersion",
  "invalidVersion",
]);

export function isValidOverlayColorOrder(order) {
  if (!Array.isArray(order)) return false;
  if (order.length !== OVERLAY_COLOR_ORDER_KEYS.length) return false;

  const valid = new Set(OVERLAY_COLOR_ORDER_KEYS);
  const seen = new Set();

  for (const key of order) {
    if (typeof key !== "string" || !valid.has(key) || seen.has(key)) {
      return false;
    }
    seen.add(key);
  }

  return true;
}

export function normalizeOverlayColorOrder(order) {
  const fallback = [...OVERLAY_COLOR_ORDER_KEYS];
  if (!Array.isArray(order)) return fallback;

  const valid = new Set(OVERLAY_COLOR_ORDER_KEYS);
  const seen = new Set();
  const normalized = [];

  for (const key of order) {
    if (typeof key !== "string" || !valid.has(key) || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }

  for (const key of OVERLAY_COLOR_ORDER_KEYS) {
    if (!seen.has(key)) normalized.push(key);
  }

  return normalized;
}

export function buildOrderedOverlayMatches(overlayMatches, order) {
  const safeOrder = normalizeOverlayColorOrder(order);
  const labels = [];
  const colors = [];

  for (const key of safeOrder) {
    const match = overlayMatches?.[key];
    if (!match) continue;
    labels.push(match.label);
    colors.push(match.color);
  }

  return { labels, colors };
}
