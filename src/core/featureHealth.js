const statuses = new Map();
const errorLogs = new Map();
const runtimeErrors = [];
const healthEvents = new Map();
const diagnosticProviders = new Map();

const MAX_PER_FEATURE_ERRORS = 10;
const MAX_RUNTIME_ERRORS = 20;
const MAX_HEALTH_EVENTS = 100;
const MAX_EVENT_MESSAGE_LENGTH = 500;
const KNOWN_STATUSES = new Set(["running", "disabled", "degraded", "failing", "unknown"]);
export const HEALTH_ERROR_CODE_NAMESPACES = Object.freeze([
  "FEATURE_", "ROUTE_", "BOOT_", "RESOURCE_", "QUEUE_", "CONFIG_", "SYNC_", "ADDON_", "SELECTOR_", "FAST_CAPTURE_",
]);

function now() { return new Date().toISOString(); }
function normalizeStatus(status) { return KNOWN_STATUSES.has(status) ? status : "unknown"; }
function getErrorMessage(error) { return error?.message ? String(error.message) : typeof error === "string" ? error : String(error ?? "Unknown error"); }

export function redactDiagnosticValue(value, maxLength = MAX_EVENT_MESSAGE_LENGTH) {
  const text = String(value ?? "")
    .replace(/\b(?:password|token|secret|authorization|cookie|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/<[^>]{1,500}>/g, "[markup]")
    .replace(/(?:data|javascript|vbscript):[^\s'\")]+/gi, "[unsafe-url]")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function normalizeMessage(value) {
  return redactDiagnosticValue(value, 180)
    .replace(/\b\d{4,}\b/g, "#")
    .replace(/[a-f0-9]{12,}/gi, "#");
}

function safeEventCopy(event) { return { ...event, details: event.details ? { ...event.details } : null }; }

export function recordHealthEvent({
  code = "FEATURE_UNKNOWN",
  severity = "warning",
  ownerId = "",
  subsystem = "framework",
  message = "",
  correlationId = "",
  operationId = "",
  routeGeneration = 0,
  details = null,
} = {}) {
  const normalizedCode = String(code || "FEATURE_UNKNOWN").trim().toUpperCase();
  const normalizedOwner = String(ownerId || "").trim();
  const normalizedSubsystem = String(subsystem || "framework").trim();
  const safeMessage = redactDiagnosticValue(message);
  const signature = `${normalizedCode}|${normalizedOwner}|${normalizedSubsystem}|${normalizeMessage(safeMessage)}`;
  const existing = healthEvents.get(signature);
  const timestamp = now();
  const safeDetails = details && typeof details === "object"
    ? Object.fromEntries(Object.entries(details).slice(0, 12).map(([key, value]) => [String(key), redactDiagnosticValue(value, 160)]))
    : null;
  const event = existing || {
    code: normalizedCode, severity: String(severity || "warning"), ownerId: normalizedOwner,
    subsystem: normalizedSubsystem, message: safeMessage, correlationId: String(correlationId || ""),
    operationId: String(operationId || ""), routeGeneration: Number(routeGeneration) || 0,
    firstSeen: timestamp, count: 0, details: safeDetails,
  };
  event.count += 1;
  event.lastSeen = timestamp;
  event.timestamp = timestamp;
  if (correlationId) event.correlationId = String(correlationId);
  if (operationId) event.operationId = String(operationId);
  if (safeDetails) event.details = safeDetails;
  healthEvents.delete(signature);
  healthEvents.set(signature, event);
  while (healthEvents.size > MAX_HEALTH_EVENTS) healthEvents.delete(healthEvents.keys().next().value);
  return safeEventCopy(event);
}

export function getHealthEvents() { return [...healthEvents.values()].map(safeEventCopy); }
export function clearHealthEventsForTests() { healthEvents.clear(); }

export function registerDiagnosticsProvider(id, provider) {
  const key = String(id || "").trim();
  if (!key || typeof provider !== "function") return () => {};
  diagnosticProviders.set(key, provider);
  return () => diagnosticProviders.delete(key);
}

export function getHealthDiagnostics() {
  const snapshots = {};
  for (const [id, provider] of diagnosticProviders) {
    try { snapshots[id] = JSON.parse(JSON.stringify(provider())); }
    catch { snapshots[id] = { unavailable: true }; }
  }
  return Object.freeze({ events: getHealthEvents(), eventCount: healthEvents.size, snapshots });
}

function formatDetails(error, phase = "") {
  const message = redactDiagnosticValue(getErrorMessage(error));
  const normalizedPhase = String(phase || "").trim();
  return normalizedPhase ? `[${normalizedPhase}] ${message}` : message;
}

function phaseCode(phase, fallback) {
  const normalized = String(phase || "").toUpperCase();
  if (normalized.startsWith("BOOT")) return `BOOT_${fallback}`;
  if (normalized.startsWith("ROUTE")) return `ROUTE_${fallback}`;
  if (normalized.startsWith("QUEUE") || normalized.startsWith("TASKQUEUE")) return `QUEUE_${fallback}`;
  if (normalized.startsWith("FASTCAPTURE") || normalized.startsWith("FAST_CAPTURE")) return `FAST_CAPTURE_${fallback}`;
  if (normalized.startsWith("ADDON")) return `ADDON_${fallback}`;
  return `FEATURE_${fallback}`;
}

export function setFeatureStatus(id, status, details = null) {
  if (!id) return;
  const safeDetails = details ? redactDiagnosticValue(details) : null;
  statuses.set(id, { status: normalizeStatus(status), details: safeDetails, lastUpdated: now() });
  if ((status === "failing" || status === "degraded") && safeDetails) pushFeatureError(id, safeDetails);
}

export function reportFeatureFailure(id, error, phase = "runtime", context = {}) {
  if (!id) return "";
  const details = formatDetails(error, phase);
  setFeatureStatus(id, "failing", details);
  recordHealthEvent({ code: phaseCode(phase, "FAILURE"), severity: "error", ownerId: id, subsystem: "feature", message: details, ...context });
  return details;
}

export function reportFeatureWarning(id, error, phase = "runtime", context = {}) {
  if (!id) return "";
  const details = formatDetails(error, phase);
  setFeatureStatus(id, "degraded", details);
  recordHealthEvent({ code: phaseCode(phase, "WARNING"), severity: "warning", ownerId: id, subsystem: "feature", message: details, ...context });
  return details;
}

export function reportRuntimeError(error, phase = "runtime", context = {}) {
  const details = formatDetails(error, phase);
  pushRuntimeError(details);
  recordHealthEvent({ code: "FEATURE_RUNTIME_ERROR", severity: "error", subsystem: "runtime", message: details, ...context });
  return details;
}

export function recordSelectorDiagnostic({ key = "unknown", required = false, fallbackUsed = false, matched = false, routeContext = null } = {}) {
  if (matched && !fallbackUsed) return;
  recordHealthEvent({
    code: matched ? "SELECTOR_FALLBACK_USED" : required ? "SELECTOR_REQUIRED_MISS" : "SELECTOR_OPTIONAL_MISS",
    severity: required && !matched ? "warning" : "info", ownerId: String(key), subsystem: "selector",
    message: matched ? "Fallback selector used" : required ? "Required selector not found" : "Optional selector not found",
    correlationId: routeContext?.correlationId || "", routeGeneration: routeContext?.generation || 0,
    details: { selectorKey: key, required, fallbackUsed, decision: required && !matched ? "degrade-owner" : "skip" },
  });
}

export function pushFeatureError(id, details) {
  if (!id || !details) return;
  if (!errorLogs.has(id)) errorLogs.set(id, []);
  const log = errorLogs.get(id);
  log.push({ timestamp: now(), details: redactDiagnosticValue(details) });
  if (log.length > MAX_PER_FEATURE_ERRORS) log.shift();
}
export function getFeatureErrors(id) { return [...(errorLogs.get(id) || [])]; }
export function pushRuntimeError(details) { if (!details) return; runtimeErrors.push({ timestamp: now(), details: redactDiagnosticValue(details) }); if (runtimeErrors.length > MAX_RUNTIME_ERRORS) runtimeErrors.shift(); }
export function getRuntimeErrors() { return [...runtimeErrors]; }
export function getFeatureStatus(id) { return statuses.get(id) || { status: "unknown", details: null, lastUpdated: null }; }
export function getAllFeatureStatuses() { const result = {}; for (const [id, val] of statuses) result[id] = { ...val, errorLog: [...(errorLogs.get(id) || [])] }; return result; }
export function clearFeatureStatus(id) { if (id) statuses.delete(id); }
