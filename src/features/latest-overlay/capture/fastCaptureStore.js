import { reportFeatureWarning } from "../../../core/featureHealth.js";
import { FAST_CAPTURE_LIMITS } from "./limits.js";

let snapshot = createIdleSnapshot();
let consumer = null;
let evictedEntries = 0;

function createIdleSnapshot() {
  return {
    status: "idle",
    data: null,
    sourceUrl: "",
    transport: "",
    capturedAt: 0,
    expiresAt: 0,
    generation: 0,
    errorMessage: "",
    byteSize: 0,
  };
}

function cloneSnapshot(value = snapshot) {
  return {
    status: value.status,
    data: value.data,
    sourceUrl: value.sourceUrl,
    transport: value.transport,
    capturedAt: value.capturedAt,
    expiresAt: value.expiresAt,
    generation: value.generation,
    errorMessage: value.errorMessage,
  };
}

function evictExpired(now = Date.now()) {
  if (snapshot.expiresAt > 0 && snapshot.expiresAt <= now) {
    snapshot = createIdleSnapshot();
    evictedEntries += 1;
  }
}

function notifyConsumer() {
  if (!consumer) return;
  try { consumer(cloneSnapshot()); }
  catch (error) { reportFeatureWarning("Latest Overlay", error, "latestCapture.consumer"); }
}

export function setLatestCaptureCaptured({
  data = null,
  sourceUrl = "",
  transport = "",
  capturedAt = Date.now(),
  generation = 0,
  byteSize = 0,
} = {}) {
  const normalizedCapturedAt = Number(capturedAt) || Date.now();
  snapshot = {
    status: "captured",
    data,
    sourceUrl: String(sourceUrl || "").trim(),
    transport: String(transport || "").trim(),
    capturedAt: normalizedCapturedAt,
    expiresAt: normalizedCapturedAt + FAST_CAPTURE_LIMITS.entryTtlMs,
    generation: Math.max(0, Number(generation) || 0),
    errorMessage: "",
    byteSize: Math.max(0, Number(byteSize) || 0),
  };
  notifyConsumer();
}

export function setLatestCaptureError({
  sourceUrl = "",
  transport = "",
  errorMessage = "",
  capturedAt = Date.now(),
} = {}) {
  evictExpired();
  snapshot = {
    ...snapshot,
    status: "error",
    sourceUrl: String(sourceUrl || "").trim(),
    transport: String(transport || "").trim(),
    capturedAt: Number(capturedAt) || Date.now(),
    errorMessage: String(errorMessage || "").trim(),
  };
  notifyConsumer();
}

export function getLatestCaptureSnapshot() {
  evictExpired();
  return cloneSnapshot();
}

export function hasLatestCaptureData() {
  evictExpired();
  return snapshot.status === "captured";
}

export function setLatestCaptureConsumer(callback) {
  consumer = typeof callback === "function" ? callback : null;
  return () => {
    if (consumer === callback) consumer = null;
  };
}

export function getLatestCaptureStoreDiagnostics() {
  evictExpired();
  return Object.freeze({
    entryCount: snapshot.status === "idle" ? 0 : 1,
    retainedBytes: snapshot.status === "idle" ? 0 : snapshot.byteSize,
    maxRetainedBytes: FAST_CAPTURE_LIMITS.maxRetainedBytes,
    evictedEntries,
    oldestAgeMs: snapshot.capturedAt ? Math.max(0, Date.now() - snapshot.capturedAt) : 0,
  });
}

export function resetLatestCaptureStoreForTests() {
  snapshot = createIdleSnapshot();
  consumer = null;
  evictedEntries = 0;
}
