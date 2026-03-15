/**
 * Gets a nested property from an object using dot-notation path.
 * Returns undefined for non-string paths.
 */
export function getByPath(obj, path) {
  if (typeof path !== "string") return undefined;
  return path.split(".").reduce((acc, part) => acc && acc[part], obj);
}

function isObjectLike(value) {
  return value !== null && typeof value === "object";
}

export function normalizeObject(value) {
  return isObjectLike(value) ? value : {};
}

export function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Sets a nested property on an object using dot-notation path.
 * Creates missing intermediate objects and overwrites primitive
 * intermediates to avoid strict-mode assignment errors.
 * Returns true when write succeeds; false otherwise.
 */
export function setByPath(obj, path, value) {
  if (!isObjectLike(obj) || typeof path !== "string" || path.length === 0) return false;
  const keys = path.split(".");
  const lastKey = keys.pop();
  if (!lastKey) return false;

  let target = obj;
  for (const part of keys) {
    const current = target[part];
    if (!isObjectLike(current)) {
      target[part] = {};
    }
    target = target[part];
  }

  target[lastKey] = value;
  return true;
}
