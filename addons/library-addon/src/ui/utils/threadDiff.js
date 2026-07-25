import { safeText } from "./formatters.js";

export function getThreadDiffSummary(entry, snapshot) {
  if (!entry || !snapshot || snapshot.threadId !== entry.threadId) {
    return { changed: false, fields: [] };
  }

  const fields = [];
  const thread = entry.thread || {};
  if (safeText(thread.title) !== safeText(snapshot.title)) fields.push("title");

  const leftPrefixes = Array.isArray(thread.prefixes)
    ? thread.prefixes
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

  if (safeText(thread.currentVersion) !== safeText(snapshot.gameVersion)) fields.push("version");
  if (safeText(thread.developer) !== safeText(snapshot.developer)) fields.push("developer");
  if (Number(thread.threadRating ?? null) !== Number(snapshot.threadRating ?? null)) fields.push("rating");
  if (safeText(thread.url) !== safeText(snapshot.url)) fields.push("url");

  const leftTags = Array.isArray(thread.tags)
    ? thread.tags.map((tag) => safeText(tag)).filter(Boolean)
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
