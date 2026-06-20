const fastCaptureStore = new Map();
const fastCaptureSubscribers = new Map();

function createIdleSnapshot() {
  return {
    status: "idle",
    data: null,
    sourceUrl: "",
    transport: "",
    capturedAt: 0,
    expiresAt: 0,
    generation: 0,
    mode: "latest",
    errorMessage: "",
  };
}

function getExistingSnapshot(key) {
  const snapshot = fastCaptureStore.get(key);
  if (!snapshot) return createIdleSnapshot();
  if (snapshot.expiresAt > 0 && snapshot.expiresAt <= Date.now()) {
    fastCaptureStore.delete(key);
    return createIdleSnapshot();
  }
  return snapshot;
}

function cloneSnapshot(snapshot) {
  return {
    status: snapshot.status,
    data: snapshot.data,
    sourceUrl: snapshot.sourceUrl,
    transport: snapshot.transport,
    capturedAt: snapshot.capturedAt,
    expiresAt: snapshot.expiresAt,
    generation: snapshot.generation,
    mode: snapshot.mode,
    errorMessage: snapshot.errorMessage,
  };
}

function writeSnapshot(key, snapshot) {
  fastCaptureStore.set(key, snapshot);
  notifyFastCaptureSubscribers(key, snapshot);
  return snapshot;
}

function notifyFastCaptureSubscribers(key, snapshot) {
  const subscribers = fastCaptureSubscribers.get(key);
  if (!subscribers || subscribers.size === 0) return;

  for (const callback of subscribers) {
    try {
      callback(cloneSnapshot(snapshot));
    } catch {}
  }
}

export function setFastCaptureCaptured(
  key,
  {
    data = null,
    sourceUrl = "",
    transport = "",
    capturedAt = Date.now(),
    ttlMs = 0,
    generation = 0,
    mode = "latest",
  } = {},
) {
  const normalizedCapturedAt = Number(capturedAt) || Date.now();
  return writeSnapshot(String(key || "").trim(), {
    status: "captured",
    data,
    sourceUrl: String(sourceUrl || "").trim(),
    transport: String(transport || "").trim(),
    capturedAt: normalizedCapturedAt,
    expiresAt: ttlMs > 0 ? normalizedCapturedAt + ttlMs : 0,
    generation: Math.max(0, Number(generation) || 0),
    mode: String(mode || "latest"),
    errorMessage: "",
  });
}

export function setFastCaptureError(
  key,
  { sourceUrl = "", transport = "", errorMessage = "", capturedAt = Date.now() } = {},
) {
  const existing = getExistingSnapshot(String(key || "").trim());
  return writeSnapshot(String(key || "").trim(), {
    status: "error",
    data: existing.data,
    sourceUrl: String(sourceUrl || "").trim(),
    transport: String(transport || "").trim(),
    capturedAt: Number(capturedAt) || Date.now(),
    expiresAt: existing.expiresAt,
    generation: existing.generation,
    mode: existing.mode,
    errorMessage: String(errorMessage || "").trim(),
  });
}

export function getFastCaptureSnapshot(key) {
  const snapshot = getExistingSnapshot(String(key || "").trim());
  return cloneSnapshot(snapshot);
}

export function getFastCaptureData(key) {
  const snapshot = getExistingSnapshot(String(key || "").trim());
  return snapshot.status === "captured" ? snapshot.data : undefined;
}

export function hasFastCaptureData(key) {
  const snapshot = getExistingSnapshot(String(key || "").trim());
  return snapshot.status === "captured";
}

export function subscribeFastCapture(key, callback) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey || typeof callback !== "function") {
    return () => {};
  }

  let subscribers = fastCaptureSubscribers.get(normalizedKey);
  if (!subscribers) {
    subscribers = new Set();
    fastCaptureSubscribers.set(normalizedKey, subscribers);
  }

  subscribers.add(callback);

  return () => {
    const currentSubscribers = fastCaptureSubscribers.get(normalizedKey);
    if (!currentSubscribers) return;
    currentSubscribers.delete(callback);
    if (currentSubscribers.size === 0) {
      fastCaptureSubscribers.delete(normalizedKey);
    }
  };
}

export function resetFastCaptureStoreForTests() {
  fastCaptureStore.clear();
  fastCaptureSubscribers.clear();
}
