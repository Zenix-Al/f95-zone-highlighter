export const LATEST_DATA_CAPTURE_KEY = "latest-raw-capture";

function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function numericIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((id) => Number(id)).filter(Number.isFinite);
}

export function normalizeLatestRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const threadId = finiteNumber(raw.thread_id);
  if (threadId === null) return null;

  return {
    ...raw,
    thread_id: threadId,
    title: String(raw.title || "").trim(),
    creator: String(raw.creator || "").trim(),
    version: String(raw.version || "").trim(),
    views: finiteNumber(raw.views, 0),
    likes: finiteNumber(raw.likes, 0),
    prefixes: numericIds(raw.prefixes),
    tags: numericIds(raw.tags),
    rating: finiteNumber(raw.rating),
    cover: String(raw.cover || "").trim(),
    screens: Array.isArray(raw.screens) ? raw.screens.map(String) : [],
    date: String(raw.date || "").trim(),
    watched: Boolean(raw.watched),
    ignored: Boolean(raw.ignored),
    new: Boolean(raw.new),
    ts: finiteNumber(raw.ts, 0),
  };
}

export function buildLatestRecordMap(records) {
  const result = new Map();
  for (const raw of Array.isArray(records) ? records : []) {
    const record = normalizeLatestRecord(raw);
    if (record) result.set(record.thread_id, record);
  }
  return result;
}

export function calculateRecordAgeDays(record, capturedAt) {
  const timestamp = finiteNumber(record?.ts, 0);
  const capturedSeconds = finiteNumber(capturedAt, Date.now()) / 1000;
  if (timestamp <= 0 || capturedSeconds <= timestamp) return 1;
  return Math.max(1, (capturedSeconds - timestamp) / 86400);
}

class LatestDataIndex {
  constructor() {
    this.clear();
  }

  replaceSnapshot(snapshot) {
    if (snapshot?.status !== "captured" || !Array.isArray(snapshot.data)) return false;
    this.records = buildLatestRecordMap(snapshot.data);
    this.capturedAt = Number(snapshot.capturedAt) || Date.now();
    this.sourceUrl = String(snapshot.sourceUrl || "");
    this.transport = String(snapshot.transport || "");
    return true;
  }

  get(threadId) {
    return this.records.get(Number(threadId)) || null;
  }

  clear() {
    this.records = new Map();
    this.capturedAt = 0;
    this.sourceUrl = "";
    this.transport = "";
  }
}

export const latestDataIndex = new LatestDataIndex();
