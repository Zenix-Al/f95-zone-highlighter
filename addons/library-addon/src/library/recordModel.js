function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) =>
      String(entry || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}

function normalizePrefixes(value, fallbackPrefix = "") {
  const list = Array.isArray(value) ? value : [];
  const normalized = [];

  for (const item of list) {
    if (!item) continue;
    if (typeof item === "string") {
      const label = String(item || "").trim();
      if (label) normalized.push({ label, color: "" });
      continue;
    }
    if (typeof item === "object") {
      const label = String(item.label || "").trim();
      if (!label) continue;
      const color = String(item.color || "").trim();
      normalized.push({ label, color });
    }
  }

  if (normalized.length === 0) {
    const legacy = String(fallbackPrefix || "").trim();
    if (legacy) return [{ label: legacy, color: "" }];
  }

  return normalized;
}

function deriveMetaFromTitle(title) {
  const parts = [];
  let remaining = String(title || "").trim();
  while (parts.length < 2) {
    const match = remaining.match(/\[([^\]]+)\]\s*$/);
    if (!match?.[1]) break;
    parts.push(String(match[1]).trim());
    remaining = remaining.slice(0, match.index).trim();
  }
  return {
    developer: parts[0] || "",
    gameVersion: parts[1] || "",
  };
}

export function normalizeRecord(record) {
  const now = Date.now();
  const title = String(record?.title || "").trim();
  const prefix = String(record?.prefix || "").trim();
  const derived = deriveMetaFromTitle(title);
  const gameVersion = String(record?.gameVersion || "").trim() || derived.gameVersion;
  const developer = String(record?.developer || "").trim() || derived.developer;
  const threadRatingRaw = record?.threadRating;
  const threadRatingNum =
    threadRatingRaw === null || typeof threadRatingRaw === "undefined" ? null : Number(threadRatingRaw);
  const threadRating = Number.isFinite(threadRatingNum) ? threadRatingNum : null;

  return {
    threadId: String(record?.threadId || "").trim(),
    url: String(record?.url || "").trim(),
    title,
    canonicalTitle: String(record?.canonicalTitle || title).trim(),
    titleNormalized: String(record?.titleNormalized || title)
      .trim()
      .toLowerCase(),
    prefix,
    prefixes: normalizePrefixes(record?.prefixes, prefix),
    gameVersion,
    developer,
    threadRating,
    tags: normalizeList(record?.tags),
    userStatus: String(record?.userStatus || "saved").trim() || "saved",
    note: String(record?.note || "").trim(),
    userScore: record?.userScore ?? null,
    pinned: Boolean(record?.pinned),
    schemaVersion: Number(record?.schemaVersion || 3),
    sourcePage: String(record?.sourcePage || "thread").trim() || "thread",
    createdAt: Number(record?.createdAt || now),
    updatedAt: Number(record?.updatedAt || now),
  };
}

export function normalizeTagList(value) {
  return normalizeList(value);
}
