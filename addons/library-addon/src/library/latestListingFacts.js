import { decodeHtmlText } from "../thread/title.js";

const text = (value) => decodeHtmlText(value).replace(/\s+/g, " ").trim();
const id = (value) => (typeof value === "string" || Number.isSafeInteger(value)) && /^[1-9]\d*$/.test(String(value)) ? String(value) : "";

function mapIds(ids, catalog, prefix) {
  if (!Array.isArray(ids) || ids.length > 256) return null;
  if (!ids.length) return [];
  if (!Array.isArray(catalog)) return null;
  const map = new Map();
  const conflicts = new Set();
  for (const entry of catalog.slice(0, 20000)) {
    if (!id(entry?.id) || typeof entry.name !== "string" || !entry.name.trim()) continue;
    const mapped = prefix ? {
      label: text(entry.name),
      color: String(entry.class || "").split(/\s+/).find((token) => /^(label--|pre-)[a-z0-9_-]+$/i.test(token))?.replace(/^(label--|pre-)/, "") || "",
    } : text(entry.name).toLowerCase();
    const key = id(entry.id);
    if (map.has(key) && JSON.stringify(map.get(key)) !== JSON.stringify(mapped)) conflicts.add(key);
    map.set(key, mapped);
  }
  if (ids.some((value) => !id(value) || !map.has(id(value)) || conflicts.has(id(value)))) return null;
  return [...new Set(ids.map(id))].map((key) => map.get(key));
}

export function mapLatestListingFacts(row, record, catalogs) {
  const value = { title: text(row.title), currentVersion: text(row.version), url: record.thread.url };
  if (Object.hasOwn(row, "creator")) {
    if (typeof row.creator !== "string" || row.creator.length > 1000) return { ok: false, reason: "invalid_facts" };
    value.developer = text(row.creator);
  }
  if (Object.hasOwn(row, "rating")) {
    if (typeof row.rating !== "number" || !Number.isFinite(row.rating) || row.rating < 0 || row.rating > 5) return { ok: false, reason: "invalid_facts" };
    value.threadRating = row.rating;
  }
  for (const field of ["tags", "prefixes"]) {
    if (!Object.hasOwn(row, field)) continue;
    const mapped = mapIds(row[field], field === "tags" ? catalogs?.tags : catalogs?.prefixes?.items, field === "prefixes");
    if (mapped === null) return { ok: false, reason: "mapping_incomplete" };
    value[field] = mapped;
  }
  return { ok: true, value };
}
