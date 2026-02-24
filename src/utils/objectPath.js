/**
 * Gets a nested property from an object using dot-notation path.
 * Returns undefined for non-string paths.
 */
export function getByPath(obj, path) {
  if (typeof path !== "string") return undefined;
  return path.split(".").reduce((acc, part) => acc && acc[part], obj);
}

/**
 * Sets a nested property on an object using dot-notation path.
 * Creates missing intermediate objects. No-op for non-string paths.
 */
export function setByPath(obj, path, value) {
  if (typeof path !== "string") return;
  const keys = path.split(".");
  const lastKey = keys.pop();
  const target = keys.reduce((acc, part) => {
    acc[part] = acc[part] || {};
    return acc[part];
  }, obj);
  if (target) {
    target[lastKey] = value;
  }
}
