import { createQueue } from "./queue.js";

// addons/image-repair-addon/src/feature.js
export function createRetryManager({
  imageHost,
  retryDelay,
  maxAttempts,
  isEnabled,
  recordSuccess,
  recordFail,
  notifyAllDone,
  notifyMaxAttempts,
  ui,
}) {
  const retrying = new Set();
  let queueTimer = null;
  let notifInfo = { isErrorNotified: false, isCompleteNotified: false };

  function resetNotifInfo() {
    notifInfo.isErrorNotified = false;
    notifInfo.isCompleteNotified = false;
  }

  function markDone(img, success, duration) {
    retrying.delete(img);
    img.dataset.retrying = "false";
    img.dataset.retryAttached = "true";

    if (success) {
      recordSuccess(duration);
      if (retrying.size === 0 && !notifInfo.isCompleteNotified) {
        notifInfo.isCompleteNotified = true;
        notifyAllDone();
      }
    } else {
      recordFail();
    }
    ui.updateToast(retrying);
  }

  function doRetry(img, startTime, attempt) {
    retrying.add(img);
    ui.updateToast(retrying);

    img.src = img.dataset.originalSrc + "?retry=" + Date.now();

    setTimeout(() => {
      if (!isEnabled()) return;

      if (img.complete && img.naturalWidth > 0) {
        markDone(img, true, performance.now() - startTime);
        return;
      }

      if (attempt >= maxAttempts) {
        markDone(img, false);
        if (!notifInfo.isErrorNotified) {
          notifInfo.isErrorNotified = true;
          notifyMaxAttempts(maxAttempts);
        }
        return;
      }

      doRetry(img, startTime, attempt + 1);
    }, retryDelay);
  }

  function enqueue(img) {
    if (img.dataset.retryAttached || !img.src?.startsWith(imageHost)) return;

    if (!img.dataset.originalSrc) {
      img.dataset.originalSrc = img.src;
    }

    const startTime = performance.now();

    // If already broken, retry immediately
    if (img.complete && img.naturalWidth === 0) {
      doRetry(img, startTime, 0);
    } else {
      // Otherwise wait for error
      img.addEventListener(
        "error",
        () => {
          if (img.dataset.retryAttached) return;
          doRetry(img, startTime, 0);
        },
        { once: true },
      );
    }
  }

  function enable() {
    retrying.clear();
    resetNotifInfo();
    ui.injectUi();
    // Scan existing images
    document.querySelectorAll("img").forEach(enqueue);
  }

  function disable() {
    retrying.clear();
    ui.destroyUi();
  }

  return {
    enable,
    disable,
    enqueue, // used by observer
  };
}
