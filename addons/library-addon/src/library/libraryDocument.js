import { getActivityTypes } from "./activityEventModel.js";

export const LIBRARY_DOCUMENT_VERSION = 2;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validTime(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

export function normalizeLibraryDocument(input) {
  if (Array.isArray(input)) {
    return { sourceVersion: 0, records: input, updates: [], activity: [] };
  }
  if (!isObject(input)) {
    return { sourceVersion: null, records: [], updates: [], activity: [] };
  }
  const sourceVersion = Number(input.version || 1);
  return {
    sourceVersion,
    records: Array.isArray(input.records) ? input.records : [],
    updates: sourceVersion >= 2 && Array.isArray(input.updates) ? input.updates : [],
    activity: sourceVersion >= 2 && Array.isArray(input.activity) ? input.activity : [],
  };
}

export function validateUpdateEvent(event, index = 0) {
  const issues = [];
  const path = `updates[${index}]`;
  if (!isObject(event)) return [`${path}: expected object`];
  if (!String(event.id || "").trim()) issues.push(`${path}.id: required`);
  if (!String(event.threadId || "").trim()) issues.push(`${path}.threadId: required`);
  if (!["version", "thread-facts"].includes(String(event.type || ""))) {
    issues.push(`${path}.type: invalid`);
  }
  if (!validTime(event.observedAt)) issues.push(`${path}.observedAt: invalid`);
  if (!Array.isArray(event.fields)) issues.push(`${path}.fields: expected array`);
  if (!isObject(event.before)) issues.push(`${path}.before: expected object`);
  if (!isObject(event.after)) issues.push(`${path}.after: expected object`);
  return issues;
}

export function validateActivityEvent(event, index = 0) {
  const issues = [];
  const path = `activity[${index}]`;
  if (!isObject(event)) return [`${path}: expected object`];
  if (!String(event.id || "").trim()) issues.push(`${path}.id: required`);
  if (!String(event.threadId || "").trim()) issues.push(`${path}.threadId: required`);
  if (!String(event.commandId || "").trim()) issues.push(`${path}.commandId: required`);
  if (!getActivityTypes().includes(String(event.type || ""))) issues.push(`${path}.type: invalid`);
  if (!validTime(event.occurredAt)) issues.push(`${path}.occurredAt: invalid`);
  return issues;
}

export function createLibraryDocument({ records = [], updates = [], activity = [], exportedAt }) {
  return {
    version: LIBRARY_DOCUMENT_VERSION,
    exportedAt: exportedAt || new Date().toISOString(),
    records,
    updates,
    activity,
  };
}

export function planHistorySection(incoming, existing, validate, section) {
  const issues = [];
  const existingById = new Map(
    (Array.isArray(existing) ? existing : []).map((event) => [String(event?.id || ""), event]),
  );
  const seen = new Map();
  const operations = [];
  let skippedExisting = 0;
  let skippedDuplicate = 0;
  let conflicts = 0;

  (Array.isArray(incoming) ? incoming : []).forEach((event, index) => {
    issues.push(...validate(event, index));
    const id = String(event?.id || "");
    if (!id) return;
    if (seen.has(id)) {
      skippedDuplicate += 1;
      if (JSON.stringify(seen.get(id)) !== JSON.stringify(event)) conflicts += 1;
      return;
    }
    seen.set(id, event);
    if (existingById.has(id)) {
      skippedExisting += 1;
      if (JSON.stringify(existingById.get(id)) !== JSON.stringify(event)) conflicts += 1;
      return;
    }
    operations.push({ mode: "add", value: event });
  });

  return {
    section,
    total: incoming.length,
    operations,
    writeCount: operations.length,
    skippedExisting,
    skippedDuplicate,
    conflicts,
    issues,
  };
}
