const TAG_PREF_LIMIT = 1000;
const STATUS_RANK = Object.freeze({
  marked: 0,
  preferred: 1,
  normal: 2,
  excluded: 3,
});

function normalizedName(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 120);
}

function normalizedIds(value) {
  const ids = [];
  const seen = new Set();
  for (const candidate of Array.isArray(value) ? value : []) {
    const id = Number(candidate);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= TAG_PREF_LIMIT) break;
  }
  return Object.freeze(ids);
}

function normalizedColors(value) {
  const candidate = value && typeof value === "object" ? value : {};
  const result = {};
  for (const key of ["marked", "preferred", "excluded"]) {
    const color = String(candidate[key] || "").trim().slice(0, 32);
    if (color) result[key] = color;
  }
  return Object.freeze(result);
}

export function normalizeCoreTagPrefs(result) {
  const value = result?.ok && result.value && typeof result.value === "object"
    ? result.value
    : {};
  const tags = [];
  const seenIds = new Set();
  for (const candidate of Array.isArray(value.tags) ? value.tags : []) {
    const id = Number(candidate?.id);
    const name = String(candidate?.name || candidate?.label || candidate?.title || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    if (!Number.isInteger(id) || id <= 0 || !name || seenIds.has(id)) continue;
    seenIds.add(id);
    tags.push(Object.freeze({ id, name }));
    if (tags.length >= TAG_PREF_LIMIT) break;
  }
  return Object.freeze({
    available: result?.ok === true,
    tags: Object.freeze(tags),
    preferredTags: normalizedIds(value.preferredTags),
    excludedTags: normalizedIds(value.excludedTags),
    markedTags: normalizedIds(value.markedTags),
    color: normalizedColors(value.color),
  });
}

function resolveCoreStatus(id, prefs) {
  if (!id) return "normal";
  if (prefs.preferredTags.includes(id)) return "preferred";
  if (prefs.excludedTags.includes(id)) return "excluded";
  if (prefs.markedTags.includes(id)) return "marked";
  return "normal";
}

export function buildDisplayTags(threadTags, prefs, { excludedTagMode = "muted" } = {}) {
  const catalogByName = new Map(
    prefs.tags.map((tag) => [normalizedName(tag.name), tag.id]),
  );
  const display = (Array.isArray(threadTags) ? threadTags : []).map((label, index) => {
    const safeLabel = String(label || "").replace(/\s+/g, " ").trim().slice(0, 120);
    const id = catalogByName.get(normalizedName(safeLabel)) || null;
    const status = prefs.available ? resolveCoreStatus(id, prefs) : "normal";
    return Object.freeze({
      id,
      label: safeLabel,
      status,
      originalIndex: index,
      color: status === "normal" ? "" : String(prefs.color[status] || ""),
    });
  }).filter((tag) => tag.label);

  const renderable = excludedTagMode === "hidden"
    ? display.filter((tag) => tag.status !== "excluded")
    : display;
  renderable.sort((left, right) =>
    STATUS_RANK[left.status] - STATUS_RANK[right.status]
    || left.originalIndex - right.originalIndex,
  );
  return Object.freeze(renderable);
}

export function buildTagView(tags, { expanded = false, visibleTagLimit = 8 } = {}) {
  const limit = Math.max(1, Math.min(20, Math.round(Number(visibleTagLimit) || 8)));
  const values = Array.isArray(tags) ? tags : [];
  const overflow = Math.max(0, values.length - limit);
  return Object.freeze({
    expanded: Boolean(expanded),
    hiddenCount: expanded ? 0 : overflow,
    overflow,
    tags: Object.freeze(expanded ? [...values] : values.slice(0, limit)),
    visibleTagLimit: limit,
  });
}

export const CORE_TAG_STATUS_PRECEDENCE = Object.freeze([
  "preferred",
  "excluded",
  "marked",
]);
