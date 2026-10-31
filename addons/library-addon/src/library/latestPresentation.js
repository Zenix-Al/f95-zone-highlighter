// Optional last-observed feed facts, deliberately excluded from update history.
export function normalizeLatestPresentation(source = {}) {
  if (!source || typeof source !== "object") return {};
  const result = {};
  const image = (value) => {
    if (typeof value !== "string" || value.length > 2048) return "";
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
    } catch { return ""; }
  };
  if (Object.hasOwn(source, "cover")) {
    const url = image(source.cover);
    if (url) result.cover = url;
  }
  if (Array.isArray(source.screens)) {
    result.screens = [...new Set(source.screens.slice(0, 20).map(image).filter(Boolean))];
  }
  for (const key of ["views", "likes", "ts"]) {
    if (typeof source[key] === "number" && Number.isSafeInteger(source[key]) && source[key] >= 0) {
      result[key] = source[key];
    }
  }
  for (const key of ["watched", "ignored", "new"]) {
    if (typeof source[key] === "boolean") result[key] = source[key];
  }
  return result;
}
