function text(value) {
  return String(value ?? "").trim();
}

function normalizedText(value) {
  return text(value).replace(/\s+/g, " ").toLowerCase();
}

export function normalizeVersionIdentity(value) {
  return normalizedText(value).replace(/^v(?=\d)/, "");
}

function normalizePrefixes(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => normalizedText(item?.label ?? item))
    .filter(Boolean);
}

function normalizeTags(value) {
  return (Array.isArray(value) ? value : [])
    .map(normalizedText)
    .filter(Boolean)
    .sort();
}

export function createThreadFactsSnapshot(record) {
  const thread = record?.thread || {};
  return {
    title: normalizedText(thread.title),
    developer: normalizedText(thread.developer),
    version: normalizeVersionIdentity(thread.currentVersion),
    displayVersion: text(thread.currentVersion),
    rating:
      thread.threadRating === null || typeof thread.threadRating === "undefined"
        ? null
        : Number(thread.threadRating),
    url: text(thread.url),
    prefixes: normalizePrefixes(thread.prefixes),
    tags: normalizeTags(thread.tags),
  };
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function diffThreadFacts(previousRecord, nextRecord) {
  const before = createThreadFactsSnapshot(previousRecord);
  const after = createThreadFactsSnapshot(nextRecord);
  const fields = [];
  for (const field of ["title", "developer", "rating", "url", "prefixes", "tags"]) {
    if (!equal(before[field], after[field])) fields.push(field);
  }
  const versionChanged =
    Boolean(before.version) &&
    Boolean(after.version) &&
    before.version !== after.version;
  if (versionChanged) fields.push("version");
  return {
    changed: fields.length > 0,
    fields,
    versionChanged,
    before,
    after,
  };
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createUpdateEvent(threadId, diff, observedAt) {
  if (!diff?.changed) return null;
  const signature = JSON.stringify({
    fields: diff.fields,
    before: diff.before,
    after: diff.after,
  });
  return {
    id: `update:${text(threadId)}:${hashText(signature)}`,
    threadId: text(threadId),
    type: diff.versionChanged ? "version" : "thread-facts",
    observedAt: Number(observedAt),
    version: diff.after.displayVersion,
    previousVersion: diff.before.displayVersion,
    fields: [...diff.fields],
    before: diff.before,
    after: diff.after,
  };
}
