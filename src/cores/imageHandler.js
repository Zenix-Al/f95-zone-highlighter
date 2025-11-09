// cores/imageHandler.js
import { retryImage } from "./retryLogic.js";
import { updateToast } from "../ui/toast.js";
import { recordSuccess } from "./metrics.js";
import { config } from "../constants.js";
import { injectUI } from "../ui/imgRetryUi.js";
import { observeDom } from "./observer.js";

export function injectImageRepair() {
  if (!config.threadSettings.imgRetry) return;
  const retryingImages = new Set();

  function initImageRetry() {
    document.querySelectorAll("img").forEach((img) => handleImage(img, retryingImages));
    updateToast(retryingImages, config.metrics);
  }

  injectUI();
  initImageRetry();
  observeDom(initImageRetry);
}
export function handleImage(img, retryingImages) {
  if (!img.src.startsWith("https://attachments.f95zone.to/")) return;
  if (img.dataset.retryAttached) return;

  img.dataset.originalSrc = img.dataset.originalSrc || img.src;
  const start = performance.now();

  const MAX_ATTEMPTS = 10;
  const RETRY_DELAY = 4000;

  function handleSuccess() {
    const duration = performance.now() - start;
    retryingImages.delete(img);
    img.dataset.retrying = "false";
    img.dataset.retryAttached = "true";
    recordSuccess(img, duration);
    config.metrics.succeeded++;
    updateToast(retryingImages, config.metrics);
  }

  function handleError() {
    if (img.dataset.retrying !== "true") {
      img.dataset.retrying = "true";
      retryImage(img, start, retryingImages, MAX_ATTEMPTS, RETRY_DELAY);
    }
  }

  if (img.complete) {
    if (img.naturalWidth > 0) handleSuccess();
    else handleError();
  } else {
    img.addEventListener("load", handleSuccess, { once: true });
    img.addEventListener("error", handleError, { once: true });
  }
}
