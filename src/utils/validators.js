// Small set of runtime validators for config and DOM values
export function isValidTag(tag) {
  return typeof tag === "string" && tag.trim().length > 0;
}

export function isValidColor(hex) {
  if (typeof hex !== "string") return false;
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex.trim());
}

export function isValidVersion(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

export function isPositiveInteger(n) {
  return Number.isInteger(n) && n > 0;
}

export function isValidLatestOverlayColorOrder(order) {
  if (!Array.isArray(order)) return false;

  const validKeys = new Set([
    "excluded",
    "preferred",
    "completed",
    "onhold",
    "abandoned",
    "highVersion",
    "invalidVersion",
  ]);

  return order.every((key) => typeof key === "string" && validKeys.has(key));
}

export default {
  isValidTag,
  isValidColor,
  isValidVersion,
  isPositiveInteger,
  isValidLatestOverlayColorOrder,
};
