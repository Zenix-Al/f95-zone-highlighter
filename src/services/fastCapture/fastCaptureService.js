import { getByPath } from "../../utils/objectPath.js";
import { debugLog } from "../../core/logger.js";
import {
  getFastCaptureSnapshot,
  hasFastCaptureData,
  setFastCaptureCaptured,
  setFastCaptureError,
} from "./fastCaptureStore.js";
import { createCaptureQueue } from "./captureQueue.js";
import {
  initPageCaptureTransport,
  resetPageCaptureTransportForTests,
  syncPageCaptureRules,
} from "./pageCaptureTransport.js";
import {
  deactivateSandboxCaptureTransport,
  initSandboxCaptureTransport,
  resetSandboxCaptureTransportForTests,
} from "./sandboxCaptureTransport.js";

const captures = new Map();
const LOG_CHANNEL = "fast-capture";
const TRANSPORTS = new Set(["xhr", "fetch", "any"]);
const MODES = new Set(["latest", "oncePerRoute", "oncePerDocument"]);
let routeGeneration = 0;
let transportInitialized = false;
let recoveryObserver = null;
let recoveryTimer = null;
let recoveryStopTimer = null;
const pendingRecoveryKeys = new Set();
const attemptedRecoveryKeys = new Set();
const recoveryScheduleTimes = new Map(); // Track when recovery was scheduled for each key

function monotonicNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function matchesFastCaptureUrl(url, urlIncludes) {
  const needles = Array.isArray(urlIncludes) ? urlIncludes : [urlIncludes];
  return needles.some((needle) => needle && String(url || "").includes(String(needle).trim()));
}

function matchingCaptures(transport, url) {
  return [...captures.values()].filter(
    (entry) =>
      entry.active &&
      (entry.transport === "any" || entry.transport === transport) &&
      matchesFastCaptureUrl(url, entry.urlIncludes),
  );
}

function normalizeFeature(feature) {
  const config = feature?.fastCapture;
  if (feature?.bootstrapMode !== "fast" || !config) return null;
  const urlIncludes = (Array.isArray(config.urlIncludes) ? config.urlIncludes : [config.urlIncludes])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const mode = MODES.has(config.mode)
    ? config.mode
    : config.once === false
      ? "latest"
      : "oncePerDocument";
  return {
    featureKey: String(feature.featureKey || feature.id || feature.name || "").trim(),
    featureName: String(feature.name || feature.id || "Fast Capture").trim(),
    urlIncludes,
    dataPath: String(config.dataPath || "").trim(),
    transport: TRANSPORTS.has(config.transport) ? config.transport : "any",
    mode,
    ttlMs: Math.max(0, Number(config.ttlMs) || 0),
    active: true,
  };
}

function isApplicable(feature) {
  if (typeof feature?.isApplicable !== "function") return true;
  try {
    return Boolean(feature.isApplicable());
  } catch (error) {
    debugLog(LOG_CHANNEL, "Feature applicability check failed", {
      data: { feature: feature?.name || "unknown", error: String(error) },
      level: "warn",
    });
    return false;
  }
}

function bridgeRules() {
  return [...captures.values()]
    .filter((entry) => entry.active)
    .map(({ urlIncludes, transport }) => ({ urlIncludes: [...urlIncludes], transport }));
}

function syncRules() {
  if (transportInitialized) syncPageCaptureRules(bridgeRules());
}

function reportError(entry, url, transport, errorMessage, { updateSnapshot = true } = {}) {
  const message = String(errorMessage || "capture_failed").trim();
  if (updateSnapshot) {
    setFastCaptureError(entry.featureKey, { sourceUrl: url, transport, errorMessage: message });
  }
  debugLog(LOG_CHANNEL, "Capture failed", {
    data: { featureKey: entry.featureKey, featureName: entry.featureName, url, transport, message },
    level: "warn",
  });
}

function reportSuccess(entry, url, transport, data) {
  const alreadyExists = hasFastCaptureData(entry.featureKey);
  const recoveryScheduleTime = recoveryScheduleTimes.get(entry.featureKey);
  const recoveryDelayMs = recoveryScheduleTime ? Number((monotonicNow() - recoveryScheduleTime).toFixed(2)) : null;

  setFastCaptureCaptured(entry.featureKey, {
    data,
    sourceUrl: url,
    transport,
    ttlMs: entry.ttlMs,
    generation: routeGeneration,
    mode: entry.mode,
  });
  debugLog(LOG_CHANNEL, "Snapshot stored", {
    data: {
      featureKey: entry.featureKey,
      transport,
      url,
      records: Array.isArray(data) ? data.length : null,
      routeGeneration,
      capturedAt: Date.now(),
      dataWasNew: !alreadyExists,
      recoveryDelayMs,
    },
  });
  if (entry.mode !== "latest") {
    entry.active = false;
    syncRules();
  }
  if ([...captures.values()].every((capture) => hasFastCaptureData(capture.featureKey))) {
    stopInitialRecoveryWatch();
  }
}

export function processCompletedFastCapture(transport, url, responseText) {
  const normalizedTransport = String(transport || "").toLowerCase();
  const normalizedUrl = String(url || "");
  const matches = matchingCaptures(normalizedTransport, normalizedUrl);
  if (matches.length === 0) return 0;

  let payload;
  try {
    payload = JSON.parse(String(responseText || ""));
  } catch {
    for (const entry of matches) {
      reportError(entry, normalizedUrl, normalizedTransport, "invalid_json_response", {
        updateSnapshot: false,
      });
    }
    return 0;
  }

  let count = 0;
  for (const entry of matches) {
    const data = getByPath(payload, entry.dataPath);
    if (typeof data === "undefined") {
      reportError(entry, normalizedUrl, normalizedTransport, `missing_data_path:${entry.dataPath}`, {
        updateSnapshot: false,
      });
      continue;
    }
    reportSuccess(entry, normalizedUrl, normalizedTransport, data);
    count += 1;
  }
  return count;
}

export function processCompletedFastCaptureError(transport, url, error) {
  const matches = matchingCaptures(String(transport || "").toLowerCase(), String(url || ""));
  for (const entry of matches) reportError(entry, url, transport, error?.message || error);
  return matches.length;
}

const queue = createCaptureQueue(({ transport, url, responseText, enqueuedAt }) => {
  const startedAt = monotonicNow();
  const capturedRules = processCompletedFastCapture(transport, url, responseText);
  debugLog(LOG_CHANNEL, "Response processed", {
    data: {
      transport,
      url,
      responseBytes: typeof responseText === "string" ? responseText.length : 0,
      capturedRules,
      queueDelayMs: Number(Math.max(0, startedAt - Number(enqueuedAt || startedAt)).toFixed(2)),
      processingMs: Number(Math.max(0, monotonicNow() - startedAt).toFixed(2)),
      navigationElapsedMs: Number(monotonicNow().toFixed(2)),
    },
  });
});

export function enqueueFastCaptureProcessing(transport, url, responseText) {
  const normalizedTransport = String(transport || "").toLowerCase();
  const normalizedUrl = String(url || "");
  const enqueuedAt = monotonicNow();
  debugLog(LOG_CHANNEL, "Response received", {
    data: {
      transport: normalizedTransport,
      url: normalizedUrl,
      responseBytes: typeof responseText === "string" ? responseText.length : 0,
      navigationElapsedMs: Number(enqueuedAt.toFixed(2)),
    },
  });
  queue.enqueue({
    transport: normalizedTransport,
    url: normalizedUrl,
    responseText,
    enqueuedAt,
  });
}

function latestMatchingResource(entry) {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") {
    return null;
  }
  const resources = performance.getEntriesByType("resource");
  for (let index = resources.length - 1; index >= 0; index -= 1) {
    const resource = resources[index];
    if (matchesFastCaptureUrl(resource?.name, entry.urlIncludes)) return resource;
  }
  return null;
}

export async function recoverFastCaptureFromPerformance(featureKey) {
  const key = String(featureKey || "").trim();
  if (!key || hasFastCaptureData(key)) return hasFastCaptureData(key);
  const entry = captures.get(key);
  const resource = entry?.active ? latestMatchingResource(entry) : null;
  if (!resource?.name || typeof globalThis.fetch !== "function") return false;

  const url = String(resource.name);
  try {
    const recoveryStartedAt = monotonicNow();
    debugLog(LOG_CHANNEL, "Recovery request started", {
      data: { featureKey: key, url, navigationElapsedMs: Number(recoveryStartedAt.toFixed(2)) },
    });
    const response = await globalThis.fetch(url, { credentials: "same-origin" });
    const responseText = await response.text();

    // A patched page/sandbox fetch may already be processing its cloned body.
    await new Promise((resolve) => setTimeout(resolve, 25));
    if (hasFastCaptureData(key)) {
      debugLog(LOG_CHANNEL, "Recovery request completed", {
        data: {
          featureKey: key,
          url,
          recovered: true,
          capturedBy: "transport",
          durationMs: Number((monotonicNow() - recoveryStartedAt).toFixed(2)),
        },
      });
      return true;
    }

    const transport = entry.transport === "any" ? "fetch" : entry.transport;
    const recovered = processCompletedFastCapture(transport, url, responseText) > 0;
    debugLog(LOG_CHANNEL, "Recovery request completed", {
      data: {
        featureKey: key,
        url,
        recovered,
        capturedBy: "direct-processing",
        durationMs: Number((monotonicNow() - recoveryStartedAt).toFixed(2)),
      },
    });
    return recovered;
  } catch (error) {
    debugLog(LOG_CHANNEL, "Recovery request failed", {
      data: { featureKey: key, featureName: entry.featureName, url, error: String(error) },
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
  pendingRecoveryKeys.clear();
  recoveryScheduleTimes.clear();
}

function scheduleRecoveryForResources(resources) {
  for (const resource of resources || []) {
    const url = String(resource?.name || "");
    if (!url) continue;
    for (const entry of captures.values()) {
      if (
        entry.active &&
        !hasFastCaptureData(entry.featureKey) &&
        !attemptedRecoveryKeys.has(entry.featureKey) &&
        matchesFastCaptureUrl(url, entry.urlIncludes)
      ) {
        pendingRecoveryKeys.add(entry.featureKey);
        // Track when recovery was scheduled for this key
        if (!recoveryScheduleTimes.has(entry.featureKey)) {
          recoveryScheduleTimes.set(entry.featureKey, monotonicNow());
        }
      }
    }
  }
  if (pendingRecoveryKeys.size === 0 || recoveryTimer) return;

  // Instant recovery to prevent feature delays when fast capture fails.
  // Recovery fires immediately instead of waiting for normal interception queue.
  recoveryTimer = setTimeout(async () => {
    recoveryTimer = null;
    const keys = [...pendingRecoveryKeys];
    pendingRecoveryKeys.clear();
    await Promise.all(
      keys.map(async (key) => {
        if (hasFastCaptureData(key) || attemptedRecoveryKeys.has(key)) return;
        attemptedRecoveryKeys.add(key);
        const scheduleTime = recoveryScheduleTimes.get(key);
        debugLog(LOG_CHANNEL, "Initial response missed; recovery selected", {
          data: { 
            featureKey: key, 
            navigationElapsedMs: Number(monotonicNow().toFixed(2)),
            timeSinceScheduledMs: scheduleTime ? Number((monotonicNow() - scheduleTime).toFixed(2)) : null,
          },
        });
        await recoverFastCaptureFromPerformance(key);
      }),
    );
  }, 0);
}

function armInitialRecoveryWatch() {
  if (recoveryObserver || typeof PerformanceObserver === "undefined") return;
  if ([...captures.values()].every((entry) => hasFastCaptureData(entry.featureKey))) return;

  recoveryObserver = new PerformanceObserver((list) => {
    scheduleRecoveryForResources(list.getEntries());
  });
  try {
    recoveryObserver.observe({ type: "resource", buffered: true });
  } catch {
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
    enqueueFastCaptureProcessing(detail.transport, detail.url, detail.responseText);
  } else if (detail.errorMessage) {
    processCompletedFastCaptureError(detail.transport, detail.url, detail.errorMessage);
  }
}

export function initFastCaptureAdapter() {
  const rules = bridgeRules();
  const pageReady = initPageCaptureTransport(rules, handlePageResult);
  transportInitialized = true;
  if (pageReady) {
    deactivateSandboxCaptureTransport();
  } else {
    initSandboxCaptureTransport({
      shouldCapture: (transport, url) => matchingCaptures(transport, url).length > 0,
      onResponse: enqueueFastCaptureProcessing,
      onError: processCompletedFastCaptureError,
    });
  }
  debugLog(LOG_CHANNEL, "Transport initialized", {
    data: {
      transport: pageReady ? "page-bridge" : "sandbox-fallback",
      activeRules: rules.length,
      navigationElapsedMs: Number(monotonicNow().toFixed(2)),
    },
  });
  armInitialRecoveryWatch();
}

export function registerFastCaptureFeatures(features = []) {
  captures.clear();
  for (const feature of Array.isArray(features) ? features : []) {
    if (!isApplicable(feature)) continue;
    const entry = normalizeFeature(feature);
    if (!entry?.featureKey || !entry.dataPath || entry.urlIncludes.length === 0) continue;
    const snapshot = hasFastCaptureData(entry.featureKey) ? getFastCaptureSnapshot(entry.featureKey) : null;
    entry.active =
      entry.mode === "latest" ||
      !snapshot ||
      (entry.mode === "oncePerRoute" && snapshot.generation !== routeGeneration);
    captures.set(entry.featureKey, entry);
  }
  if (captures.size > 0 || transportInitialized) initFastCaptureAdapter();
  debugLog(LOG_CHANNEL, "Capture features registered", {
    data: {
      registered: captures.size,
      routeGeneration,
      featureKeys: [...captures.keys()],
      navigationElapsedMs: Number(monotonicNow().toFixed(2)),
    },
  });
  return captures.size;
}

export function refreshFastCaptureFeatures(features = []) {
  routeGeneration += 1;
  return registerFastCaptureFeatures(features);
}

export function resetFastCaptureAdapterForTests() {
  captures.clear();
  routeGeneration = 0;
  transportInitialized = false;
  stopInitialRecoveryWatch();
  attemptedRecoveryKeys.clear();
  recoveryScheduleTimes.clear();
  queue.clear();
  resetPageCaptureTransportForTests();
  resetSandboxCaptureTransportForTests();
}
