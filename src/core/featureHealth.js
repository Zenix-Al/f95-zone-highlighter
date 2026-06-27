const statuses = new Map();
// Per-feature error history so repeated failures are visible even after status overwrites
const errorLogs = new Map();
// Unattributed runtime errors caught by the global listeners in featureFactory
const runtimeErrors = [];

const MAX_PER_FEATURE_ERRORS = 10;
const MAX_RUNTIME_ERRORS = 20;
const KNOWN_STATUSES = new Set(["running", "disabled", "degraded", "failing", "unknown"]);

function now() {
  return new Date().toISOString();
}

function normalizeStatus(status) {
  return KNOWN_STATUSES.has(status) ? status : "unknown";
}

function getErrorMessage(error) {
  if (error?.message) return String(error.message);
  if (typeof error === "string") return error;
  return String(error ?? "Unknown error");
}

function formatDetails(error, phase = "") {
  const message = getErrorMessage(error);
  const normalizedPhase = String(phase || "").trim();
  return normalizedPhase ? `[${normalizedPhase}] ${message}` : message;
}

export function setFeatureStatus(id, status, details = null) {
  if (!id) return;
  statuses.set(id, {
    status: normalizeStatus(status),
    details: details ? String(details) : null,
    lastUpdated: now(),
  });
  // Accumulate history for every failure so clicking "Run check" later still shows them
  if ((status === "failing" || status === "degraded") && details) {
    pushFeatureError(id, details);
  }
}

export function reportFeatureFailure(id, error, phase = "runtime") {
  if (!id) return "";
  const details = formatDetails(error, phase);
  setFeatureStatus(id, "failing", details);
  return details;
}

export function reportFeatureWarning(id, error, phase = "runtime") {
  if (!id) return "";
  const details = formatDetails(error, phase);
  setFeatureStatus(id, "degraded", details);
  return details;
}

export function reportRuntimeError(error, phase = "runtime") {
  const details = formatDetails(error, phase);
  pushRuntimeError(details);
  return details;
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
