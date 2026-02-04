// src/loader.js
import { state } from "./config";
import { executeAutoRetry } from "./features/autoRetryDownload";
import { initNoticeDismissal } from "./features/notificationCloser";
import { debugLog } from "./core/logger";
import { watchAndUpdateTiles } from "./services/latestService";
import { processThreadTags } from "./services/threadService";

export function loadFeatures() {
  if (state.isLatest) watchAndUpdateTiles();
  if (state.isThread) processThreadTags();
  if (state.isDownloadPage) {
    debugLog("Init", `Download page detected: ${state.isDownloadPage}`);
  }
  if (state.isDirectDownloadPage) {
    executeAutoRetry(state.isDirectDownloadPage.host);
  }
  if (state.isF95Zone) {
    initNoticeDismissal();
  }
}
