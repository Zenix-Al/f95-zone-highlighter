const statuses = new Map();
// Per-feature error history so repeated failures are visible even after status overwrites
const errorLogs = new Map();
// Unattributed runtime errors caught by the global listeners in featureFactory
const runtimeErrors = [];

const MAX_PER_FEATURE_ERRORS = 10;
const MAX_RUNTIME_ERRORS = 20;

function now() {
  return new Date().toISOString();
}

export function setFeatureStatus(id, status, details = null) {
  if (!id) return;
  statuses.set(id, {
    status,
    details: details ? String(details) : null,
    lastUpdated: now(),
  });
  // Accumulate history for every failure so clicking "Run check" later still shows them
  if (status === "failing" && details) {
    pushFeatureError(id, details);
  }
}

/** Append a runtime error entry for a known feature without changing its status. */
export function pushFeatureError(id, details) {
  if (!id || !details) return;
  if (!errorLogs.has(id)) errorLogs.set(id, []);
  const log = errorLogs.get(id);
  log.push({ timestamp: now(), details: String(details) });
  if (log.length > MAX_PER_FEATURE_ERRORS) log.shift();
}

/** All recorded error entries for a feature (copy). */
export function getFeatureErrors(id) {
  return [...(errorLogs.get(id) || [])];
}

/** Store an error that could not be attributed to a specific feature. */
export function pushRuntimeError(details) {
  if (!details) return;
  runtimeErrors.push({ timestamp: now(), details: String(details) });
  if (runtimeErrors.length > MAX_RUNTIME_ERRORS) runtimeErrors.shift();
}

/** All unattributed runtime errors captured this session. */
export function getRuntimeErrors() {
  return [...runtimeErrors];
}

export function getFeatureStatus(id) {
  return statuses.get(id) || { status: "unknown", details: null, lastUpdated: null };
}

export function getAllFeatureStatuses() {
  const result = {};
  for (const [id, val] of statuses.entries()) {
    result[id] = { ...val, errorLog: errorLogs.get(id) || [] };
  }
  return result;
}

export function clearFeatureStatus(id) {
  if (id) statuses.delete(id);
}

export default {
  setFeatureStatus,
  pushFeatureError,
  getFeatureErrors,
  pushRuntimeError,
  getRuntimeErrors,
  getFeatureStatus,
  getAllFeatureStatuses,
  clearFeatureStatus,
};
