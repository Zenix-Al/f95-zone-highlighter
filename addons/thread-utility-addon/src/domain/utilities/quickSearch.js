export const QUICK_SEARCH_LIMIT = 30;

export const DEFAULT_QUICK_SEARCHES = Object.freeze([
  Object.freeze({ id: "update", label: "Update", query: "Update", includeTitle: true, enabled: true, order: 0 }),
  Object.freeze({ id: "new-compressed", label: "New+Compressed", query: "Compressed", includeTitle: true, enabled: true, order: 1 }),
  Object.freeze({ id: "compressed", label: "Compressed", query: "Compressed", includeTitle: false, enabled: true, order: 2 }),
  Object.freeze({ id: "walkthrough", label: "Walkthrough", query: "Walkthrough", includeTitle: true, enabled: true, order: 3 }),
  Object.freeze({ id: "mod", label: "Mod", query: "Mod", includeTitle: false, enabled: true, order: 4 }),
  Object.freeze({ id: "cheats", label: "Cheats", query: "Cheats", includeTitle: true, enabled: true, order: 5 }),
]);

function boundedText(value, limit) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function normalizedId(value, index) {
  const id = boundedText(value, 48)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id || `utility-${index + 1}`;
}

export function normalizeQuickSearches(value) {
  const source = Array.isArray(value) ? value.slice(0, QUICK_SEARCH_LIMIT) : [];
  const seen = new Map();
  const normalized = [];
  for (let index = 0; index < source.length; index += 1) {
    const candidate = source[index] && typeof source[index] === "object"
      ? source[index]
      : {};
    const label = boundedText(candidate.label, 40);
    const query = boundedText(candidate.query, 120);
    if (!label || !query) continue;
    const baseId = normalizedId(candidate.id, index);
    const duplicateNumber = (seen.get(baseId) || 0) + 1;
    seen.set(baseId, duplicateNumber);
    const id = duplicateNumber === 1
      ? baseId
      : `${baseId.slice(0, 44)}-${duplicateNumber}`;
    const requestedOrder = Number(candidate.order);
    normalized.push({
      id,
      label,
      query,
      includeTitle: candidate.includeTitle === true,
      enabled: candidate.enabled !== false,
      order: Number.isFinite(requestedOrder) ? Math.round(requestedOrder) : index,
      originalIndex: index,
    });
  }
  const repaired = normalized.length ? normalized : DEFAULT_QUICK_SEARCHES;
  return Object.freeze(
    repaired
      .slice()
      .sort((left, right) =>
        Number(left.order) - Number(right.order)
        || Number(left.originalIndex ?? left.order) - Number(right.originalIndex ?? right.order),
      )
      .map((entry, order) => Object.freeze({
        id: entry.id,
        label: entry.label,
        query: entry.query,
        includeTitle: entry.includeTitle,
        enabled: entry.enabled,
        order,
      })),
  );
}

export function buildSearchTerm(definition, snapshot) {
  const query = boundedText(definition?.query, 120);
  const title = definition?.includeTitle
    ? boundedText(snapshot?.canonicalTitle || snapshot?.title, 240)
    : "";
  return boundedText([title, query].filter(Boolean).join(" "), 360);
}

export function buildQuickSearchUrl({
  definition,
  snapshot,
  scope = "thread",
  origin = "https://f95zone.to",
}) {
  const searchTerm = buildSearchTerm(definition, snapshot);
  if (!searchTerm) return null;
  const url = new URL("/search/1/", origin);
  url.searchParams.set("q", searchTerm);
  url.searchParams.set("t", "post");
  url.searchParams.set("o", "relevance");
  if (scope === "thread" && String(snapshot?.threadId || "").trim()) {
    url.searchParams.set("c[thread]", String(snapshot.threadId).trim());
  }
  return url;
}

export function registerQuickSearchUtilities(registry, definitions, executeSearch) {
  for (const definition of definitions) {
    if (!definition.enabled) continue;
    registry.register({
      id: `search:${definition.id}`,
      family: "quick-search",
      label: definition.label,
      execute: (context) => executeSearch(definition, context),
    });
  }
}
