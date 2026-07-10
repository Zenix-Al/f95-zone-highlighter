/** Public facade for fast-capture consumers and bootstrap orchestration. */
export {
  enqueueFastCaptureProcessing,
  getFastCaptureDiagnostics,
  initFastCaptureAdapter,
  matchesFastCaptureUrl,
  processCompletedFastCapture,
  processCompletedFastCaptureError,
  recoverFastCaptureFromPerformance,
  refreshFastCaptureFeatures,
  registerFastCaptureFeatures,
  resetFastCaptureAdapterForTests,
} from "./fastCaptureService.js";
export {
  getFastCaptureData,
  getFastCaptureSnapshot,
  hasFastCaptureData,
  resetFastCaptureStoreForTests,
  subscribeFastCapture,
} from "./fastCaptureStore.js";
export { normalizeFastCaptureConfig } from "./rules.js";
