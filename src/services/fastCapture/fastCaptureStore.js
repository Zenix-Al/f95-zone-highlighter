import { reportFeatureWarning } from "../../core/featureHealth.js";
import { FAST_CAPTURE_LIMITS } from "./limits.js";

const fastCaptureStore = new Map();
const fastCaptureSubscribers = new Map();
let retainedBytes = 0;
let evictedEntries = 0;

function createIdleSnapshot() {
  return { status: "idle", data: null, sourceUrl: "", transport: "", capturedAt: 0, expiresAt: 0, generation: 0, mode: "latest", errorMessage: "", byteSize: 0 };
}

function removeSnapshot(key) {
  const snapshot = fastCaptureStore.get(key);
  if (!snapshot) return null;
  retainedBytes = Math.max(0, retainedBytes - Number(snapshot.byteSize || 0));
  fastCaptureStore.delete(key);
  return snapshot;
}

function evictExpired(now = Date.now()) {
  for (const [key, snapshot] of fastCaptureStore) {
    if (snapshot.expiresAt > 0 && snapshot.expiresAt <= now) removeSnapshot(key);
  }
}

function evictToLimit() {
  while (retainedBytes > FAST_CAPTURE_LIMITS.maxRetainedBytes && fastCaptureStore.size > 0) {
    removeSnapshot(fastCaptureStore.keys().next().value);
    evictedEntries += 1;
  }
}

function getExistingSnapshot(key) {
  evictExpired();
  return fastCaptureStore.get(key) || createIdleSnapshot();
}

function cloneSnapshot(snapshot) {
  return { status: snapshot.status, data: snapshot.data, sourceUrl: snapshot.sourceUrl, transport: snapshot.transport, capturedAt: snapshot.capturedAt, expiresAt: snapshot.expiresAt, generation: snapshot.generation, mode: snapshot.mode, errorMessage: snapshot.errorMessage };
}

function notifyFastCaptureSubscribers(key, snapshot) {
  const subscribers = fastCaptureSubscribers.get(key);
  if (!subscribers) return;
  for (const entry of subscribers) {
    try { entry.callback(cloneSnapshot(snapshot)); }
    catch (error) { reportFeatureWarning(entry.healthId, error, `fastCapture.subscriber:${key}`); }
  }
}

function writeSnapshot(key, snapshot) {
  removeSnapshot(key);
  fastCaptureStore.set(key, snapshot);
  retainedBytes += Number(snapshot.byteSize || 0);
  evictToLimit();
  if (fastCaptureStore.get(key) === snapshot) notifyFastCaptureSubscribers(key, snapshot);
  return snapshot;
}

export function setFastCaptureCaptured(key, { data = null, sourceUrl = "", transport = "", capturedAt = Date.now(), ttlMs = FAST_CAPTURE_LIMITS.entryTtlMs, generation = 0, mode = "latest", byteSize = 0 } = {}) {
  const normalizedKey = String(key || "").trim();
  const normalizedCapturedAt = Number(capturedAt) || Date.now();
  return writeSnapshot(normalizedKey, {
    status: "captured", data, sourceUrl: String(sourceUrl || "").trim(), transport: String(transport || "").trim(),
    capturedAt: normalizedCapturedAt, expiresAt: Math.max(0, Number(ttlMs) || 0) > 0 ? normalizedCapturedAt + Math.max(0, Number(ttlMs) || 0) : 0,
    generation: Math.max(0, Number(generation) || 0), mode: String(mode || "latest"), errorMessage: "", byteSize: Math.max(0, Number(byteSize) || 0),
  });
}

export function setFastCaptureError(key, { sourceUrl = "", transport = "", errorMessage = "", capturedAt = Date.now() } = {}) {
  const normalizedKey = String(key || "").trim();
  const existing = getExistingSnapshot(normalizedKey);
  return writeSnapshot(normalizedKey, { ...existing, status: "error", data: existing.data, sourceUrl: String(sourceUrl || "").trim(), transport: String(transport || "").trim(), capturedAt: Number(capturedAt) || Date.now(), errorMessage: String(errorMessage || "").trim() });
}

export function getFastCaptureSnapshot(key) { return cloneSnapshot(getExistingSnapshot(String(key || "").trim())); }
export function getFastCaptureData(key) { const snapshot = getExistingSnapshot(String(key || "").trim()); return snapshot.status === "captured" ? snapshot.data : undefined; }
export function hasFastCaptureData(key) { return getExistingSnapshot(String(key || "").trim()).status === "captured"; }

export function subscribeFastCapture(key, callback, { emitCurrent = true, subscriberId = "", healthId = "" } = {}) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey || typeof callback !== "function") return () => {};
  const subscribers = fastCaptureSubscribers.get(normalizedKey) || new Set();
  fastCaptureSubscribers.set(normalizedKey, subscribers);
  const entry = { callback, healthId: String(healthId || subscriberId || normalizedKey || "Fast Capture").trim() };
  subscribers.add(entry);
  if (emitCurrent) {
    try { callback(getFastCaptureSnapshot(normalizedKey)); }
    catch (error) { reportFeatureWarning(entry.healthId, error, `fastCapture.subscriber:${normalizedKey}`); }
  }
  return () => { const current = fastCaptureSubscribers.get(normalizedKey); current?.delete(entry); if (current?.size === 0) fastCaptureSubscribers.delete(normalizedKey); };
}

export function getFastCaptureStoreDiagnostics() {
  evictExpired();
  const oldestCapturedAt = [...fastCaptureStore.values()].reduce((oldest, snapshot) => !oldest || snapshot.capturedAt < oldest ? snapshot.capturedAt : oldest, 0);
  return Object.freeze({ entryCount: fastCaptureStore.size, retainedBytes, maxRetainedBytes: FAST_CAPTURE_LIMITS.maxRetainedBytes, evictedEntries, oldestAgeMs: oldestCapturedAt ? Math.max(0, Date.now() - oldestCapturedAt) : 0 });
}

export function resetFastCaptureStoreForTests() { fastCaptureStore.clear(); fastCaptureSubscribers.clear(); retainedBytes = 0; evictedEntries = 0; }
