// cores/retryLogic.js
import { recordFail, recordSuccess } from "../services/metricsService.js";
import { notifyAllDone, notifyMaxAttempts } from "../services/notificationService.js";
import { updateToast } from "../ui/components/toast.js";
import { config } from "../config.js";
export const notifInfo = {
  isErrorNotified: false,
  isCompleteNotified: false,
};
export function retryImage(img, start, retryingImages, MAX_ATTEMPTS, RETRY_DELAY) {
  function markDone(success = true, duration = null) {
    retryingImages.delete(img);
    img.dataset.retrying = "false";
    img.dataset.retryAttached = "true";
    if (success) recordSuccess(img, duration, () => updateToast(retryingImages, config.metrics));
    else recordFail(() => updateToast(retryingImages, config.metrics));
    updateToast(retryingImages, config.metrics);

    if (retryingImages.size === 0 && !notifInfo.isCompleteNotified) {
      notifInfo.isCompleteNotified = true;
      notifyAllDone();
    }
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

      if (attempt >= MAX_ATTEMPTS && !notifInfo.isErrorNotified) {
        notifInfo.isErrorNotified = true;
        markDone(false);
        notifyMaxAttempts(MAX_ATTEMPTS);
      }

      doRetry(attempt + 1);
    }, RETRY_DELAY);
  }

  doRetry(0);
}
