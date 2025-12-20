// cores/imageHandler.js
import { retryImage } from "./retryLogic.js";
import { updateToast } from "../ui/toast.js";
import { recordSuccess } from "./metrics.js";
import { config } from "../constants.js";
import { destroyInjectedUI, injectUI } from "../ui/imgRetryUi.js";
import { observeDom } from "./observer.js";

let domObserver = null;
export function injectImageRepair() {
  if (!config.threadSettings.imgRetry) {
    destroyImageRepair();
    return;
  }
  if (config.isImgRetryInjected) return;
  config.isImgRetryInjected = true;

  const retryingImages = new Set();

  function initImageRetry() {
    document.querySelectorAll("img").forEach((img) => handleImage(img, retryingImages));
    updateToast(retryingImages, config.metrics);
  }

  injectUI();
  initImageRetry();

  // store observer reference
  domObserver = observeDom(initImageRetry);
}

export function handleImage(img, retryingImages) {
  if (
    !config.threadSettings.imgRetry ||
    img.dataset.retryAttached ||
    !img.src.startsWith("https://attachments.f95zone.to/")
  ) {
    return;
  }

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

export function destroyImageRepair() {
  if (!config.isImgRetryInjected) return;
  config.isImgRetryInjected = false;
  destroyInjectedUI();
  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
  }
}
