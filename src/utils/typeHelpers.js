export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function getSafeTrimmedString(value, fallback = "") {
  return isNonEmptyString(value) ? value.trim() : fallback;
}
