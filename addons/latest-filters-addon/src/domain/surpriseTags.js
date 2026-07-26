const DEFAULT_WEIGHT = 1;
const PREFERRED_WEIGHT = 4;
const EXCLUDED_WEIGHT = 0.25;

function toIdSet(value) {
  return new Set(
    (Array.isArray(value) ? value : [])
      .map(Number)
      .filter((id) => Number.isFinite(id) && id > 0),
  );
}

function safeRandom(rng) {
  const value = Number(rng?.());
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1 - Number.EPSILON;
  return value;
}

export function getSurpriseTagWeight(
  tagId,
  { preferred = new Set(), excluded = new Set() } = {},
) {
  if (excluded.has(tagId)) return EXCLUDED_WEIGHT;
  if (preferred.has(tagId)) return PREFERRED_WEIGHT;
  return DEFAULT_WEIGHT;
}

export function createSurpriseTagCandidates(tagPrefs) {
  const source = tagPrefs && typeof tagPrefs === "object" ? tagPrefs : {};
  const preferred = toIdSet(source.preferredTags);
  const excluded = toIdSet(source.excludedTags);
  const seen = new Set();
  const candidates = [];
  for (const tag of Array.isArray(source.tags) ? source.tags : []) {
    const id = Number(tag?.id);
    const name = String(tag?.name || "").trim();
    if (!Number.isFinite(id) || id <= 0 || !name || seen.has(id)) continue;
    seen.add(id);
    candidates.push({
      id,
      name,
      weight: getSurpriseTagWeight(id, { preferred, excluded }),
    });
  }
  return candidates;
}

export function selectSurpriseTags(
  tagPrefs,
  { rng = Math.random, minCount = 1, maxCount = 3 } = {},
) {
  const pool = createSurpriseTagCandidates(tagPrefs);
  if (pool.length === 0) {
    return { ok: false, reason: "tag_catalog_unavailable", tags: [] };
  }
  const minimum = Math.min(
    pool.length,
    Math.max(1, Math.floor(Number(minCount) || 1)),
  );
  const maximum = Math.min(
    pool.length,
    Math.max(minimum, Math.floor(Number(maxCount) || 3)),
  );
  const count =
    minimum === maximum
      ? minimum
      : minimum + Math.floor(safeRandom(rng) * (maximum - minimum + 1));
  const selected = [];
  while (selected.length < count && pool.length > 0) {
    const totalWeight = pool.reduce(
      (sum, candidate) => sum + candidate.weight,
      0,
    );
    let threshold = safeRandom(rng) * totalWeight;
    let selectedIndex = pool.length - 1;
    for (let index = 0; index < pool.length; index += 1) {
      threshold -= pool[index].weight;
      if (threshold < 0) {
        selectedIndex = index;
        break;
      }
    }
    selected.push(pool[selectedIndex]);
    pool.splice(selectedIndex, 1);
  }
  return { ok: true, tags: selected };
}
