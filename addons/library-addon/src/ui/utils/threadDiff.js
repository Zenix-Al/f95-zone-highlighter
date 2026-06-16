import { safeText } from "./formatters.js";

export function getThreadDiffSummary(entry, snapshot) {
  if (!entry || !snapshot || snapshot.threadId !== entry.threadId) {
    return { changed: false, fields: [] };
  }

  const fields = [];
  if (safeText(entry.title) !== safeText(snapshot.title)) fields.push("title");
  if (safeText(entry.prefix) !== safeText(snapshot.prefix)) fields.push("prefix");

  const leftPrefixes = Array.isArray(entry.prefixes)
    ? entry.prefixes
        .map((prefix) => safeText(prefix?.label).toLowerCase())
        .filter(Boolean)
        .join("|")
    : "";
  const rightPrefixes = Array.isArray(snapshot.prefixes)
    ? snapshot.prefixes
        .map((prefix) => safeText(prefix?.label).toLowerCase())
        .filter(Boolean)
        .join("|")
    : "";
  if (leftPrefixes !== rightPrefixes) fields.push("prefixes");

  if (safeText(entry.gameVersion) !== safeText(snapshot.gameVersion)) fields.push("version");
  if (safeText(entry.developer) !== safeText(snapshot.developer)) fields.push("developer");
  if (Number(entry.threadRating ?? null) !== Number(snapshot.threadRating ?? null)) fields.push("rating");
  if (safeText(entry.url) !== safeText(snapshot.url)) fields.push("url");

  const leftTags = Array.isArray(entry.tags)
    ? entry.tags.map((tag) => safeText(tag)).filter(Boolean)
    : [];
  const rightTags = Array.isArray(snapshot.tags)
    ? snapshot.tags.map((tag) => safeText(tag).toLowerCase()).filter(Boolean)
    : [];
  if (leftTags.join("|") !== rightTags.join("|")) fields.push("tags");

  return {
    changed: fields.length > 0,
    fields,
  };
}
