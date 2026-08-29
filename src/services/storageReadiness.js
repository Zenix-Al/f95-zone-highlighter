const TERMINAL_STATES = new Set(["ready", "degraded-readonly", "upgrade-required", "unavailable"]);
const waiters = new Set();
const subscribers = new Set();
let snapshot = createStorageReadinessSnapshot();

export function createStorageReadinessSnapshot(overrides = {}) {
  return Object.freeze({
    state: "idle",
    source: "",
    schemaVersion: null,
    canRead: false,
    canWrite: false,
    canDelete: false,
    usingFallback: false,
    requiresUpgrade: false,
    manager: "unknown",
    reason: "",
    failedStep: "",
    startedAt: 0,
    settledAt: 0,
    attempt: 0,
    ...overrides,
  });
}

export function isTerminalStorageState(state) {
  return TERMINAL_STATES.has(String(state || ""));
}

export function getStorageReadinessSnapshot() {
  return snapshot;
}

export function publishStorageReadiness(next) {
  snapshot = createStorageReadinessSnapshot(next);
  for (const subscriber of [...subscribers]) {
    try { subscriber(snapshot); } catch { /* readiness publication must remain authoritative */ }
  }
  if (isTerminalStorageState(snapshot.state)) {
    for (const resolve of waiters) resolve(snapshot);
    waiters.clear();
  }
  return snapshot;
}

export function subscribeStorageReadiness(subscriber) {
  if (typeof subscriber !== "function") return () => {};
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

function writeDecision(current) {
  if (current.state === "ready") return { ok: true, reason: "", snapshot: current };
  if (current.state === "upgrade-required") return { ok: false, reason: "upgrade_required", snapshot: current };
  if (current.state === "unavailable") return { ok: false, reason: "storage_unavailable", snapshot: current };
  if (current.state === "degraded-readonly") return { ok: false, reason: "storage_read_only", snapshot: current };
  if (current.state === "idle") return { ok: false, reason: "storage_not_ready", snapshot: current };
  return null;
}

export async function waitForStorageWriteAccess() {
  const immediate = writeDecision(snapshot);
  if (immediate) return immediate;
  const settled = await new Promise((resolve) => waiters.add(resolve));
  return writeDecision(settled) || { ok: false, reason: "storage_not_ready", snapshot: settled };
}

export function getStorageFailureMessage(reason) {
  if (reason === "storage_read_only") return "Settings are read-only because storage recovery did not finish. Open Feature Health for details.";
  if (reason === "storage_unavailable") return "Userscript storage is unavailable. Open Feature Health and check the manager grants and storage permissions.";
  if (reason === "upgrade_required") return "This stored configuration requires the supported bridge version. Open Feature Health for details.";
  if (reason === "storage_write_failed") return "The userscript manager rejected the storage write.";
  return "Storage initialization has not finished yet. Open Feature Health for details.";
}

export function resetStorageReadinessForTests() {
  for (const resolve of waiters) resolve(createStorageReadinessSnapshot());
  waiters.clear();
  snapshot = createStorageReadinessSnapshot();
}
