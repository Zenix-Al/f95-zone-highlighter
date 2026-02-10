// cores/retryLogic.js
import { recordFail, recordSuccess } from "../../services/metricsService.js";
import { notifyAllDone, notifyMaxAttempts } from "../../services/notificationService.js";
import { updateToast } from "./ui.js";
import { config } from "../../config.js";
export const notifInfo = {
  isErrorNotified: false,
  isCompleteNotified: false,
};
export function retryImage(img, start, retryingImages, MAX_ATTEMPTS, RETRY_DELAY) {
  function markDone(success, duration) {
    retryingImages.delete(img);
    img.dataset.retrying = "false";
    img.dataset.retryAttached = "true";
    if (success) {
      recordSuccess(img, duration, () => updateToast(retryingImages, config.metrics));
      // Only show "All Done" if this was the last image and it succeeded.
      if (retryingImages.size === 0 && !notifInfo.isCompleteNotified) {
        notifInfo.isCompleteNotified = true;
        notifyAllDone();
      }
    } else {
      recordFail(() => updateToast(retryingImages, config.metrics));
    }
    updateToast(retryingImages, config.metrics);
  }

  function doRetry(attempt = 0) {
    config.metrics.retried++;
    retryingImages.add(img);
    updateToast(retryingImages, config.metrics);

    img.src = img.dataset.originalSrc + "?retry=" + Date.now();

    setTimeout(() => {
      if (img.complete && img.naturalWidth > 0) {
        const duration = performance.now() - start;
        markDone(true, duration);
        return;
      }

      if (attempt >= MAX_ATTEMPTS) {
        markDone(false);
        if (!notifInfo.isErrorNotified) {
          notifInfo.isErrorNotified = true;
          notifyMaxAttempts(MAX_ATTEMPTS);
        }
        return; // Stop retrying
      }

      doRetry(attempt + 1);
    }, RETRY_DELAY);
  }
  doRetry(0);
}
