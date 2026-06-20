import { createFeature } from "../../core/featureFactory.js";
import { debugLog } from "../../core/logger.js";
import {
  getFastCaptureSnapshot,
  subscribeFastCapture,
} from "../../core/fastCapture.js";
import { LATEST_DATA_CAPTURE_KEY } from "../latest-overlay/latestDataIndex.js";

const FEATURE_KEY = LATEST_DATA_CAPTURE_KEY;
const LOG_CHANNEL = "latest-raw-capture";
let unsubscribeLatestRawCapture = null;
let lastLoggedCaptureId = "";

function logSnapshot(snapshot = {}) {
  if (snapshot.status !== "captured") return;
  const captureId = `${snapshot.transport}|${snapshot.sourceUrl}|${snapshot.capturedAt}`;
  if (captureId === lastLoggedCaptureId) return;
  lastLoggedCaptureId = captureId;
  debugLog(LOG_CHANNEL, "Captured latest payload", {
    data: {
      records: snapshot.data,
      count: Array.isArray(snapshot.data) ? snapshot.data.length : 0,
      sourceUrl: snapshot.sourceUrl,
      transport: snapshot.transport,
      capturedAt: snapshot.capturedAt,
    },
  });
}

function enableLatestRawCaptureLogging() {
  logSnapshot(getFastCaptureSnapshot(FEATURE_KEY));
  if (unsubscribeLatestRawCapture) return;
  unsubscribeLatestRawCapture = subscribeFastCapture(FEATURE_KEY, logSnapshot);
}

function disableLatestRawCaptureLogging() {
  unsubscribeLatestRawCapture?.();
  unsubscribeLatestRawCapture = null;
}

export const latestRawCaptureFeature = createFeature("Latest Raw Capture", {
  id: FEATURE_KEY,
  bootstrapMode: "fast",
  isApplicable: ({ stateManager }) => stateManager.get("isLatest"),
  fastCapture: {
    urlIncludes: "latest_data.php",
    dataPath: "msg.data",
    transport: "any",
    mode: "latest",
    ttlMs: 30000,
  },
  enable: enableLatestRawCaptureLogging,
  disable: disableLatestRawCaptureLogging,
});
