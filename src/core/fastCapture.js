export {
  initFastCaptureAdapter,
  enqueueFastCaptureProcessing,
  matchesFastCaptureUrl,
  processCompletedFastCapture,
  processCompletedFastCaptureError,
  recoverFastCaptureFromPerformance,
  registerFastCaptureFeatures,
  refreshFastCaptureFeatures,
  resetFastCaptureAdapterForTests,
} from "./fastCaptureAdapter.js";
export {
  getFastCaptureData,
  getFastCaptureSnapshot,
  hasFastCaptureData,
  resetFastCaptureStoreForTests,
  subscribeFastCapture,
} from "./fastCaptureStore.js";
