import { normalizePersonalRatingInput } from "../../library/recordModel.js";

export const EDITOR_STATUSES = [
  "saved",
  "backlog",
  "playing",
  "paused",
  "completed",
  "dropped",
];

function normalizeText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function parseDate(value, path, issues) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    issues.push({ path, code: "invalid_date" });
    return null;
  }
  const timestamp = new Date(`${text}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== text) {
    issues.push({ path, code: "invalid_date" });
    return null;
  }
  return timestamp;
}

export function formatEditorDate(value) {
  if (value === null || value === "" || typeof value === "undefined") return "";
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp >= 0
    ? new Date(timestamp).toISOString().slice(0, 10)
    : "";
}

export function createEditorDraft(record) {
  const personal = record?.personal || {};
  return {
    status: String(personal.status || "saved"),
    rating: personal.rating ?? "",
    note: String(personal.note || ""),
    progressNote: String(personal.progressNote || ""),
    lastPlayedVersion: String(personal.lastPlayedVersion || ""),
    startedAt: formatEditorDate(personal.startedAt),
    lastPlayedAt: formatEditorDate(personal.lastPlayedAt),
    completedAt: formatEditorDate(personal.completedAt),
    droppedAt: formatEditorDate(personal.droppedAt),
    pinned: Boolean(personal.pinned),
    autoUpdateEnabled: record?.updateCheck?.enabled !== false,
  };
}

export function validateEditorDraft(draft = {}) {
  const issues = [];
  const status = String(draft.status || "").trim().toLowerCase();
  if (!EDITOR_STATUSES.includes(status)) {
    issues.push({ path: "personal.status", code: "invalid_status" });
  }

  const ratingText = String(draft.rating ?? "").trim();
  const rating = ratingText ? normalizePersonalRatingInput(ratingText) : null;
  if (
    ratingText &&
    (!Number.isFinite(Number(ratingText)) ||
      Number(ratingText) < 0 ||
      Number(ratingText) > 5)
  ) {
    issues.push({ path: "personal.rating", code: "invalid_rating" });
  }

  const personal = {
    status,
    rating,
    note: normalizeText(draft.note, 10000),
    progressNote: normalizeText(draft.progressNote, 10000),
    lastPlayedVersion: normalizeText(draft.lastPlayedVersion, 200),
    startedAt: parseDate(draft.startedAt, "personal.startedAt", issues),
    lastPlayedAt: parseDate(draft.lastPlayedAt, "personal.lastPlayedAt", issues),
    completedAt: parseDate(draft.completedAt, "personal.completedAt", issues),
    droppedAt: parseDate(draft.droppedAt, "personal.droppedAt", issues),
    pinned: Boolean(draft.pinned),
  };

  return {
    ok: issues.length === 0,
    issues,
    personal,
    autoUpdateEnabled: draft.autoUpdateEnabled !== false,
  };
}
