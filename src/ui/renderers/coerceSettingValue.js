import { isValidColor, isValidVersion } from "../../utils/validators.js";

function coerceNumber(meta, rawValue, previousValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return Number.isFinite(previousValue) ? previousValue : 0;
  }

  let next = parsed;
  const input = meta?.input || {};

  if (typeof input.min === "number" && next < input.min) {
    next = input.min;
  }
  if (typeof input.max === "number" && next > input.max) {
    next = input.max;
  }

  if (meta?.config === "latestSettings.minVersion" && !isValidVersion(next)) {
    return Number.isFinite(previousValue) ? previousValue : 0;
  }

  return next;
}

export function coerceSettingValue(meta, rawValue, previousValue) {
  if (!meta || typeof meta !== "object") return rawValue;

  switch (meta.type) {
    case "toggle":
      return Boolean(rawValue);
    case "number":
      return coerceNumber(meta, rawValue, previousValue);
    case "color": {
      const color = String(rawValue || "").trim();
      if (!isValidColor(color)) {
        return typeof previousValue === "string" ? previousValue : "#000000";
      }
      return color;
    }
    default:
      return rawValue;
  }
}

