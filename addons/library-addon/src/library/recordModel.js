const PERSONAL_STATUSES = new Set([
  "saved",
  "backlog",
  "playing",
  "paused",
  "completed",
  "dropped",
]);
const UPDATE_STATES = new Set([
  "current",
  "changed",
  "acknowledged",
  "unavailable",
  "unchecked",
]);

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function finiteDate(value, fallback = null) {
  if (value === null || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function finiteRating(value, { personal = false } = {}) {
  if (value === null || value === "" || typeof value === "undefined") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (!personal) return number;
  if (number < 0 || number > 5 || number * 2 !== Math.round(number * 2)) return null;
  return number;
}

export function normalizePersonalRatingInput(value) {
  if (value === null || String(value).trim() === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(5, Math.max(0, Math.round(number * 2) / 2));
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => text(entry).toLowerCase()).filter(Boolean);
}

function normalizePrefixes(value, fallbackPrefix = "") {
  const normalized = [];
  for (const item of Array.isArray(value) ? value : []) {
    if (typeof item === "string") {
      const label = text(item);
      if (label) normalized.push({ label, color: "" });
    } else if (item && typeof item === "object") {
      const label = text(item.label);
      if (label) normalized.push({ label, color: text(item.color) });
    }
  }
  const legacy = text(fallbackPrefix);
  return normalized.length || !legacy ? normalized : [{ label: legacy, color: "" }];
}

function deriveMetaFromTitle(title) {
  const parts = [];
  let remaining = text(title);
  while (parts.length < 2) {
    const match = remaining.match(/\[([^\]]+)\]\s*$/);
    if (!match?.[1]) break;
    parts.push(text(match[1]));
    remaining = remaining.slice(0, match.index).trim();
  }
  return { developer: parts[0] || "", currentVersion: parts[1] || "" };
}

function normalizeThread(record, now) {
  const source = record?.thread && typeof record.thread === "object" ? record.thread : record || {};
  const title = text(source.title ?? record?.title);
  const derived = deriveMetaFromTitle(title);
  const legacyPrefix = text(source.prefix ?? record?.prefix);
  const observedAt = finiteDate(
    source.observedAt ?? record?.observedAt ?? record?.updatedAt,
    now,
  );
  return {
    url: text(source.url ?? record?.url),
    title,
    canonicalTitle: text(source.canonicalTitle ?? record?.canonicalTitle, title),
    titleNormalized: text(source.titleNormalized ?? record?.titleNormalized, title).toLowerCase(),
    developer: text(source.developer ?? record?.developer) || derived.developer,
    prefixes: normalizePrefixes(source.prefixes ?? record?.prefixes, legacyPrefix),
    tags: normalizeList(source.tags ?? record?.tags),
    currentVersion:
      text(source.currentVersion ?? record?.currentVersion ?? record?.gameVersion) ||
      derived.currentVersion,
    threadRating: finiteRating(source.threadRating ?? record?.threadRating),
    sourcePage: text(source.sourcePage ?? record?.sourcePage, "thread") || "thread",
    observedAt,
    versionObservedAt: finiteDate(
      source.versionObservedAt ?? record?.versionObservedAt,
      observedAt,
    ),
  };
}

function normalizePersonal(record, now) {
  const source =
    record?.personal && typeof record.personal === "object" ? record.personal : record || {};
  const rawStatus = text(source.status ?? record?.userStatus, "saved").toLowerCase();
  const addedAt = finiteDate(source.addedAt ?? record?.createdAt, now);
  const nestedRating = source.rating;
  const legacyScore = record?.userScore;
  const legacyNumber = Number(legacyScore);
  const mappedLegacyRating =
    Number.isFinite(legacyNumber) && legacyNumber > 5 && legacyNumber <= 10
      ? legacyNumber / 2
      : legacyScore;
  return {
    status: PERSONAL_STATUSES.has(rawStatus) ? rawStatus : "saved",
    rating: finiteRating(nestedRating ?? mappedLegacyRating, { personal: true }),
    note: text(source.note ?? record?.note),
    pinned: Boolean(source.pinned ?? record?.pinned),
    progressNote: text(source.progressNote ?? record?.progressNote),
    lastPlayedVersion: text(source.lastPlayedVersion ?? record?.lastPlayedVersion),
    addedAt,
    startedAt: finiteDate(source.startedAt ?? record?.startedAt),
    lastPlayedAt: finiteDate(source.lastPlayedAt ?? record?.lastPlayedAt),
    completedAt: finiteDate(source.completedAt ?? record?.completedAt),
    droppedAt: finiteDate(source.droppedAt ?? record?.droppedAt),
    lastActivityAt: finiteDate(source.lastActivityAt ?? record?.lastActivityAt),
  };
}

function normalizeUpdateCheck(value = {}) {
  const enabled = value?.enabled !== false;
  const statuses = new Set(["pending", "checking", "current", "changed", "failed", "disabled"]);
  const status = text(value?.status, enabled ? "pending" : "disabled").toLowerCase();
  return {
    enabled,
    status: statuses.has(status) ? status : enabled ? "pending" : "disabled",
    lastAttemptAt: finiteDate(value?.lastAttemptAt),
    lastSuccessAt: finiteDate(value?.lastSuccessAt),
    nextCheckAt: finiteDate(value?.nextCheckAt),
    consecutiveFailures: Math.max(0, Math.floor(Number(value?.consecutiveFailures) || 0)),
    lastErrorCode: text(value?.lastErrorCode),
  };
}

export function normalizeRecord(record, options = {}) {
  const now = finiteDate(options.now, Date.now());
  const updateState = text(record?.updateState, "unchecked").toLowerCase();
  const personal = normalizePersonal(record, now);
  return {
    threadId: text(record?.threadId),
    thread: normalizeThread(record, now),
    personal,
    pinRankDesc: personal.pinned ? 1 : 0,
    pinRankAsc: personal.pinned ? 0 : 1,
    updateState: UPDATE_STATES.has(updateState) ? updateState : "unchecked",
    lastCheckedAt: finiteDate(record?.lastCheckedAt),
    updateCheck: normalizeUpdateCheck(record?.updateCheck),
    lastThreadChangeAt: finiteDate(record?.lastThreadChangeAt),
    recordModifiedAt: finiteDate(record?.recordModifiedAt ?? record?.updatedAt, now),
    schemaVersion: 5,
  };
}

export function mergeThreadFacts(record, threadPatch, options = {}) {
  const current = normalizeRecord(record, options);
  const source =
    threadPatch?.thread && typeof threadPatch.thread === "object"
      ? threadPatch.thread
      : threadPatch || {};
  const patchSource = { ...current.thread };
  const copy = (target, ...keys) => {
    const key = keys.find((candidate) =>
      Object.prototype.hasOwnProperty.call(source, candidate),
    );
    if (key) patchSource[target] = source[key];
  };
  copy("url", "url");
  copy("title", "title");
  copy("canonicalTitle", "canonicalTitle");
  copy("titleNormalized", "titleNormalized");
  copy("developer", "developer");
  copy("prefixes", "prefixes", "prefix");
  copy("tags", "tags");
  copy("currentVersion", "currentVersion", "gameVersion");
  copy("threadRating", "threadRating");
  copy("sourcePage", "sourcePage");
  copy("observedAt", "observedAt", "updatedAt");
  copy("versionObservedAt", "versionObservedAt");
  const patch = normalizeThread(
    patchSource,
    finiteDate(options.now, Date.now()),
  );
  return normalizeRecord(
    {
      ...current,
      thread: { ...current.thread, ...patch },
      personal: current.personal,
      recordModifiedAt: finiteDate(options.now, Date.now()),
    },
    options,
  );
}

export function mergePersonalState(record, personalPatch, options = {}) {
  const current = normalizeRecord(record, options);
  const source =
    personalPatch?.personal && typeof personalPatch.personal === "object"
      ? personalPatch.personal
      : personalPatch;
  const patchSource = {
    ...source,
    status: source?.status ?? source?.userStatus ?? current.personal.status,
    rating: source?.rating ?? source?.userScore ?? current.personal.rating,
    note: source?.note ?? current.personal.note,
    pinned: source?.pinned ?? current.personal.pinned,
  };
  const patch = normalizePersonal(
    { personal: { ...current.personal, ...patchSource } },
    finiteDate(options.now, Date.now()),
  );
  return normalizeRecord(
    {
      ...current,
      thread: current.thread,
      personal: patch,
      recordModifiedAt: finiteDate(options.now, Date.now()),
    },
    options,
  );
}

export function validateRecord(record) {
  const issues = [];
  if (!record || typeof record !== "object") return [{ path: "$", code: "object_required" }];
  if (!text(record.threadId)) issues.push({ path: "threadId", code: "required" });
  if (!record.thread || typeof record.thread !== "object") {
    issues.push({ path: "thread", code: "object_required" });
  }
  if (!record.personal || typeof record.personal !== "object") {
    issues.push({ path: "personal", code: "object_required" });
  } else {
    if (!PERSONAL_STATUSES.has(record.personal.status)) {
      issues.push({ path: "personal.status", code: "invalid_status" });
    }
    if (
      record.personal.rating !== null &&
      finiteRating(record.personal.rating, { personal: true }) === null
    ) {
      issues.push({ path: "personal.rating", code: "invalid_rating" });
    }
    for (const path of [
      "addedAt",
      "startedAt",
      "lastPlayedAt",
      "completedAt",
      "droppedAt",
      "lastActivityAt",
    ]) {
      const value = record.personal[path];
      if (value !== null && finiteDate(value) === null) {
        issues.push({ path: `personal.${path}`, code: "invalid_date" });
      }
    }
  }
  if (record.schemaVersion !== 5) issues.push({ path: "schemaVersion", code: "expected_5" });
  return issues;
}

export function normalizeTagList(value) {
  return normalizeList(value);
}
