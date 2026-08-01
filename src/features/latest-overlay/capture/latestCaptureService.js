import { debugLog } from "../../../core/logger.js";
import { registerDiagnosticsProvider } from "../../../core/featureHealth.js";
import { getRouteContext } from "../../../core/routeState.js";
import { createCaptureQueue } from "./captureQueue.js";
import {
  getLatestCaptureStoreDiagnostics,
  hasLatestCaptureData,
  setLatestCaptureCaptured,
  setLatestCaptureError,
} from "./fastCaptureStore.js";
import { FAST_CAPTURE_LIMITS, measureCaptureBytes } from "./limits.js";
import {
  initPageCaptureTransport,
  resetPageCaptureTransportForTests,
} from "./pageCaptureTransport.js";
import {
  deactivateSandboxCaptureTransport,
  initSandboxCaptureTransport,
  resetSandboxCaptureTransportForTests,
} from "./sandboxCaptureTransport.js";

const LATEST_ENDPOINT = "latest_data.php";
const LOG_CHANNEL = "latest-capture";
let routeGeneration = 0;
let captureActive = false;
let transportInitialized = false;
let recoveryObserver = null;
let recoveryTimer = null;
let recoveryStopTimer = null;
let recoveryPending = false;
let recoveryAttempted = false;
let recoveryScheduledAt = 0;
const droppedCaptures = new Map();

function monotonicNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function matchesLatestCaptureUrl(url) {
  return String(url || "").includes(LATEST_ENDPOINT);
}

function recordDropped(reason) {
  const key = String(reason || "unknown");
  droppedCaptures.set(key, (droppedCaptures.get(key) || 0) + 1);
}

function normalizeResponseText(value) {
  if (typeof value === "string") return value;
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
  if (ArrayBuffer.isView(value)) return new TextDecoder().decode(value);
  return null;
}

function validateCaptureInput(transport, url, responseText, generation = routeGeneration) {
  if (transport !== "xhr" && transport !== "fetch") return "invalid_transport";
  let parsedUrl;
  try { parsedUrl = new URL(String(url || ""), globalThis.location?.href); }
  catch { return "invalid_url"; }
  if (!/^https?:$/.test(parsedUrl.protocol)) return "invalid_url";
  const currentOrigin = globalThis.location?.origin;
  if (currentOrigin && parsedUrl.origin !== currentOrigin) return "foreign_origin";
  if (Number(generation) !== routeGeneration) return "stale_route";
  const byteSize = measureCaptureBytes(responseText);
  if (!Number.isFinite(byteSize)) return "unsupported_response";
  if (byteSize > FAST_CAPTURE_LIMITS.maxResponseBytes) return "payload_too_large";
  return null;
}

function shouldCapture(transport, url) {
  return captureActive
    && (transport === "xhr" || transport === "fetch")
    && matchesLatestCaptureUrl(url);
}

function reportError(url, transport, errorMessage, { updateSnapshot = true } = {}) {
  const message = String(errorMessage || "capture_failed").trim();
  if (updateSnapshot) setLatestCaptureError({ sourceUrl: url, transport, errorMessage: message });
  debugLog(LOG_CHANNEL, "Capture failed", {
    data: { url, transport, message },
    level: "warn",
  });
}

function reportSuccess(url, transport, data, byteSize) {
  const alreadyExists = hasLatestCaptureData();
  const recoveryDelayMs = recoveryScheduledAt
    ? Number((monotonicNow() - recoveryScheduledAt).toFixed(2))
    : null;
  setLatestCaptureCaptured({
    data,
    sourceUrl: url,
    transport,
    generation: routeGeneration,
    byteSize,
  });
  debugLog(LOG_CHANNEL, "Snapshot stored", {
    data: {
      transport,
      url,
      records: Array.isArray(data) ? data.length : null,
      routeGeneration,
      capturedAt: Date.now(),
      dataWasNew: !alreadyExists,
      recoveryDelayMs,
    },
  });
  stopInitialRecoveryWatch();
}

export function processCompletedLatestCapture(
  transport,
  url,
  responseText,
  { generation = routeGeneration } = {},
) {
  const normalizedTransport = String(transport || "").toLowerCase();
  const normalizedUrl = String(url || "");
  const validationError = validateCaptureInput(
    normalizedTransport,
    normalizedUrl,
    responseText,
    generation,
  );
  if (validationError) {
    recordDropped(validationError);
    return false;
  }
  if (!shouldCapture(normalizedTransport, normalizedUrl)) return false;

  const normalizedResponseText = normalizeResponseText(responseText);
  if (normalizedResponseText === null) {
    recordDropped("unsupported_response");
    return false;
  }

  let payload;
  try { payload = JSON.parse(normalizedResponseText); }
  catch {
    reportError(normalizedUrl, normalizedTransport, "invalid_json_response", {
      updateSnapshot: false,
    });
    return false;
  }
  const data = payload?.msg?.data;
  if (typeof data === "undefined") {
    reportError(normalizedUrl, normalizedTransport, "missing_data_path:msg.data", {
      updateSnapshot: false,
    });
    return false;
  }
  reportSuccess(
    normalizedUrl,
    normalizedTransport,
    data,
    measureCaptureBytes(responseText),
  );
  return true;
}

export function processCompletedLatestCaptureError(transport, url, error) {
  const normalizedTransport = String(transport || "").toLowerCase();
  const normalizedUrl = String(url || "");
  if (!shouldCapture(normalizedTransport, normalizedUrl)) return false;
  reportError(normalizedUrl, normalizedTransport, error?.message || error);
  return true;
}

const queue = createCaptureQueue(({ transport, url, responseText, enqueuedAt, generation }) => {
  const startedAt = monotonicNow();
  const captured = processCompletedLatestCapture(transport, url, responseText, { generation });
  debugLog(LOG_CHANNEL, "Response processed", {
    data: {
      transport,
      url,
      responseBytes: typeof responseText === "string" ? responseText.length : 0,
      captured,
      queueDelayMs: Number(Math.max(0, startedAt - Number(enqueuedAt || startedAt)).toFixed(2)),
      processingMs: Number(Math.max(0, monotonicNow() - startedAt).toFixed(2)),
      navigationElapsedMs: Number(monotonicNow().toFixed(2)),
    },
  });
}, {
  limit: FAST_CAPTURE_LIMITS.maxPendingQueueItems,
  shouldProcess: (job) => job?.generation === routeGeneration,
  onDrop: (_job, reason) => recordDropped(reason),
});

export function enqueueLatestCaptureProcessing(transport, url, responseText) {
  const normalizedTransport = String(transport || "").toLowerCase();
  const normalizedUrl = String(url || "");
  const validationError = validateCaptureInput(normalizedTransport, normalizedUrl, responseText);
  if (validationError) {
    recordDropped(validationError);
    return false;
  }
  if (!shouldCapture(normalizedTransport, normalizedUrl)) return false;
  const enqueuedAt = monotonicNow();
  queue.enqueue({
    transport: normalizedTransport,
    url: normalizedUrl,
    responseText,
    enqueuedAt,
    generation: routeGeneration,
  });
  return true;
}

function latestMatchingResource() {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") {
    return null;
  }
  const resources = performance.getEntriesByType("resource");
  for (let index = resources.length - 1; index >= 0; index -= 1) {
    if (matchesLatestCaptureUrl(resources[index]?.name)) return resources[index];
  }
  return null;
}

async function recoverLatestCaptureFromPerformance() {
  if (hasLatestCaptureData()) return true;
  const resource = captureActive ? latestMatchingResource() : null;
  if (!resource?.name || typeof globalThis.fetch !== "function") return false;
  const url = String(resource.name);
  try {
    const response = await globalThis.fetch(url, { credentials: "same-origin" });
    const responseText = await response.text();
    await new Promise((resolve) => setTimeout(resolve, 25));
    if (hasLatestCaptureData()) return true;
    return processCompletedLatestCapture("fetch", url, responseText);
  } catch (error) {
    debugLog(LOG_CHANNEL, "Recovery request failed", {
      data: { url, error: String(error) },
      level: "warn",
    });
    return false;
  }
}

function stopInitialRecoveryWatch() {
  recoveryObserver?.disconnect();
  recoveryObserver = null;
  if (recoveryTimer) clearTimeout(recoveryTimer);
  if (recoveryStopTimer) clearTimeout(recoveryStopTimer);
  recoveryTimer = null;
  recoveryStopTimer = null;
  recoveryPending = false;
  recoveryScheduledAt = 0;
}

function scheduleRecoveryForResources(resources) {
  if (recoveryAttempted || hasLatestCaptureData()) return;
  if (!(resources || []).some((resource) => matchesLatestCaptureUrl(resource?.name))) return;
  recoveryPending = true;
  if (!recoveryScheduledAt) recoveryScheduledAt = monotonicNow();
  if (recoveryTimer) return;
  recoveryTimer = setTimeout(async () => {
    recoveryTimer = null;
    if (!recoveryPending || recoveryAttempted || hasLatestCaptureData()) return;
    recoveryPending = false;
    recoveryAttempted = true;
    await recoverLatestCaptureFromPerformance();
  }, 0);
}

function armInitialRecoveryWatch() {
  if (!captureActive || recoveryObserver || hasLatestCaptureData()
    || typeof PerformanceObserver === "undefined") return;
  recoveryObserver = new PerformanceObserver((list) => {
    scheduleRecoveryForResources(list.getEntries());
  });
  try { recoveryObserver.observe({ type: "resource", buffered: true }); }
  catch {
    recoveryObserver.observe({ entryTypes: ["resource"] });
    if (typeof performance !== "undefined") {
      scheduleRecoveryForResources(performance.getEntriesByType?.("resource") || []);
    }
  }
  recoveryStopTimer = setTimeout(stopInitialRecoveryWatch, 10000);
}

function handlePageResult(event) {
  const detail = event?.detail || {};
  if (typeof detail.responseText === "string") {
    enqueueLatestCaptureProcessing(detail.transport, detail.url, detail.responseText);
  } else if (detail.errorMessage) {
    processCompletedLatestCaptureError(detail.transport, detail.url, detail.errorMessage);
  }
}

function initLatestCaptureAdapter() {
  const pageReady = initPageCaptureTransport(handlePageResult);
  transportInitialized = true;
  if (pageReady) deactivateSandboxCaptureTransport();
  else {
    initSandboxCaptureTransport({
      shouldCapture,
      onResponse: enqueueLatestCaptureProcessing,
      onError: processCompletedLatestCaptureError,
    });
  }
  armInitialRecoveryWatch();
}

function applyRouteContext(routeContext) {
  const suppliedGeneration = Number(routeContext?.generation ?? getRouteContext().generation);
  if (Number.isFinite(suppliedGeneration) && suppliedGeneration >= 0) {
    routeGeneration = suppliedGeneration;
  }
}

export function startLatestCapture(routeContext = null, { active = true } = {}) {
  applyRouteContext(routeContext);
  captureActive = Boolean(active);
  if (captureActive || transportInitialized) initLatestCaptureAdapter();
  return captureActive;
}

export function refreshLatestCapture(routeContext = null, { active = true } = {}) {
  applyRouteContext(routeContext);
  queue.clear();
  recoveryAttempted = false;
  stopInitialRecoveryWatch();
  return startLatestCapture(routeContext, { active });
}

export function getLatestCaptureDiagnostics() {
  return Object.freeze({
    ...getLatestCaptureStoreDiagnostics(),
    routeGeneration,
    activeRules: captureActive ? 1 : 0,
    registeredRules: 1,
    queue: queue.getSnapshot(),
    dropped: Object.fromEntries(droppedCaptures),
  });
}

export function resetLatestCaptureForTests() {
  captureActive = false;
  routeGeneration = 0;
  transportInitialized = false;
  recoveryAttempted = false;
  stopInitialRecoveryWatch();
  droppedCaptures.clear();
  queue.clear();
  resetPageCaptureTransportForTests();
  resetSandboxCaptureTransportForTests();
}

registerDiagnosticsProvider("latestCapture", () => getLatestCaptureDiagnostics());
