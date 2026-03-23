export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function hasOnlyKnownKeys(obj, allowedKeys) {
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) {
      return key;
    }
  }
  return "";
}

export function deepCloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
