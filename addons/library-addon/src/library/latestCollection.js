import { normalizeLatestPresentation } from "./latestPresentation.js";

export const LATEST_COLLECTION_LIMIT = 10000;
const key = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const validId = (value) => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));

// Build once per supplied catalog generation, never once per card. Collisions
// are excluded rather than guessed; prefix color can disambiguate labels.
export function createLatestCatalogLookup(catalogs = {}) {
  const build = (entries, prefix) => {
    const map = new Map();
    for (const entry of (Array.isArray(entries) ? entries : []).slice(0, 20000)) {
      if (!validId(entry?.id) || !key(entry.name)) continue;
      const color = String(entry.class || "").split(/\s+/).find((item) => /^(label--|pre-)/.test(item))?.replace(/^(label--|pre-)/, "") || "";
      const keys = prefix ? [key(entry.name), `${key(entry.name)}|${key(color)}`] : [key(entry.name)];
      for (const label of new Set(keys)) {
        const id = Number(entry.id);
        if (!map.has(label)) map.set(label, id);
        else if (map.get(label) !== id) map.set(label, null);
      }
    }
    return map;
  };
  return { tags: build(catalogs.tags, false), prefixes: build(catalogs.prefixes?.items, true) };
}

export function toLatestCollectionItem(record, lookup) {
  if (!validId(record?.threadId)) return null;
  const thread = record.thread || {};
  const latest = normalizeLatestPresentation(thread.latest);
  const nativeImage = (url) => url.replace(/[()'",]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  const mapIds = (values, map, prefix) => [...new Set((Array.isArray(values) ? values : []).map((value) => {
    const label = key(prefix ? value?.label ?? value : value);
    return prefix && value?.color ? map?.get(`${label}|${key(value.color)}`) : map?.get(label);
  }).filter((id) => Number.isSafeInteger(id) && id > 0))];
  return {
    thread_id: Number(record.threadId), title: String(thread.title || thread.canonicalTitle || ""),
    creator: String(thread.developer || ""), version: String(thread.currentVersion || ""),
    tags: mapIds(thread.tags, lookup?.tags, false), prefixes: mapIds(thread.prefixes, lookup?.prefixes, true),
    rating: typeof thread.threadRating === "number" && Number.isFinite(thread.threadRating) ? thread.threadRating : null,
    // Empty cover is a neutral renderer input; Wave 3 must verify the site's
    // fallback or provide a local placeholder. Never invent an external image URL.
    cover: nativeImage(latest.cover || ""), screens: (latest.screens || []).map(nativeImage),
    views: latest.views ?? null, likes: latest.likes ?? null, ts: latest.ts ?? null,
    date: "", watched: latest.watched ?? false, ignored: latest.ignored ?? false, new: latest.new ?? false,
  };
}

function relativeDate(timestamp, nowSeconds) {
  const age = Math.max(0, nowSeconds - timestamp);
  for (const [seconds, unit] of [[31536000, "year"], [2592000, "month"], [604800, "week"], [86400, "day"], [3600, "hour"], [60, "min"]]) {
    if (age >= seconds) {
      const count = Math.floor(age / seconds);
      return `${count} ${unit}${count === 1 ? "" : "s"}`;
    }
  }
  return "Just now";
}

export function queryLatestCollection(items, options = {}) {
  const size = Math.min(200, Math.max(1, Math.floor(Number(options.rows) || 30)));
  const contains = (ids, values) => values.some((id) => ids.includes(Number(id)));
  const list = items.filter((item) => {
    if (options.ignored === "hide" && item.ignored) return false;
    if (Number(options.date) > 0 && (!item.ts || item.ts < (Number(options.now) || Date.now()) / 1000 - Number(options.date) * 86400)) return false;
    const search = key(options.search), creator = key(options.creator);
    if (search && !key(item.title).includes(search) && !key(item.creator).includes(search)) return false;
    if (creator && !key(item.creator).includes(creator)) return false;
    if (options.tags?.length && !(options.tagtype === "or" ? contains(item.tags, options.tags) : options.tags.every((id) => item.tags.includes(Number(id))))) return false;
    if (options.prefixes?.length && !contains(item.prefixes, options.prefixes)) return false;
    return !contains(item.tags, options.notags || []) && !contains(item.prefixes, options.noprefixes || []);
  });
  list.sort((a, b) => {
    if (options.sort === "title") return a.title.localeCompare(b.title) || a.thread_id - b.thread_id;
    const field = ["likes", "views", "rating"].includes(options.sort) ? options.sort : "ts";
    if (a[field] == null && b[field] != null) return 1;
    if (b[field] == null && a[field] != null) return -1;
    return (b[field] ?? 0) - (a[field] ?? 0) || a.thread_id - b.thread_id;
  });
  const total = Math.max(1, Math.ceil(list.length / size));
  const page = Math.min(total, Math.max(1, Math.floor(Number(options.page) || 1)));
  const nowSeconds = (Number(options.now) || Date.now()) / 1000;
  const data = list.slice((page - 1) * size, page * size).map((item) => ({
    ...item, date: item.ts > 0 ? relativeDate(item.ts, nowSeconds) : "",
  }));
  return { status: "ok", msg: { data, count: list.length, pagination: { page, total } } };
}

// A controller supplies keyset reads and its existing cooperative scheduler.
// Each invocation owns its cache; caller publishes it only while isCurrent().
export async function loadLatestCollection({ readPage, lookup, yieldWork, isCurrent = () => true, limit = LATEST_COLLECTION_LIMIT }) {
  const items = new Map();
  const seenCursors = new Set();
  let cursor = null, read = 0;
  const cap = Math.min(LATEST_COLLECTION_LIMIT, Math.max(1, Number(limit) || LATEST_COLLECTION_LIMIT));
  for (;;) {
    if (!isCurrent()) return { ok: false, reason: "cancelled" };
    const result = await readPage({ cursor, limit: Math.min(100, cap - read + 1) });
    if (!isCurrent()) return { ok: false, reason: "cancelled" };
    if (!result || result.ok === false || !Array.isArray(result.rows)) return { ok: false, reason: result?.reason || "query_failed" };
    read += result.rows.length;
    if (read > cap) return { ok: false, reason: "collection_too_large" };
    for (const record of result.rows) {
      const item = toLatestCollectionItem(record, lookup);
      if (item) items.set(item.thread_id, item);
    }
    if (!result.hasNext) return { ok: true, items: [...items.values()] };
    const signature = JSON.stringify(result.nextCursor);
    if (!result.nextCursor || seenCursors.has(signature)) return { ok: false, reason: "invalid_cursor" };
    seenCursors.add(signature);
    if (seenCursors.size > LATEST_COLLECTION_LIMIT) return { ok: false, reason: "invalid_cursor" };
    cursor = result.nextCursor;
    await yieldWork();
  }
}
