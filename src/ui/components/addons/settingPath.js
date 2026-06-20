export function getSettingByPath(obj, path) {
  if (!obj || typeof obj !== "object" || !path) return undefined;
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}
