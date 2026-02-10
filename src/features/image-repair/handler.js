import { retryImage } from "./retryLogic.js";
import { recordSuccess } from "../../services/metricsService.js";
import { config, state } from "../../config.js";
import { updateToast } from "./ui.js";
import { addObserverCallback, removeObserverCallback } from "../../core/observer.js";
import { createTaskQueue } from "../../core/taskQueue.js";
import { injectUI, destroyInjectedUI } from "./ui.js";

let imageQueue = null;

export function enableImageRepair() {
  if (state.isImgRetryInjected) return;
  state.isImgRetryInjected = true;

  // Create a new queue instance for this feature
  imageQueue = createTaskQueue({
    delay: 200, // A small delay between starting each image check
    name: "ImageRepairQueue",
  });

  const retryingImages = new Set();

  // Initial run for images already on the page
  function initImageRetry() {
    document
      .querySelectorAll("img")
      .forEach((img) => imageQueue.add(img, () => handleImage(img, retryingImages)));
    updateToast(retryingImages, config.metrics);
  }

  // Optimized handler for the MutationObserver that only processes new nodes
  function processMutations(mutationsList) {
    for (const mutation of mutationsList) {
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            // If the added node is an image itself
            if (node.tagName === "IMG") {
              imageQueue.add(node, () => handleImage(node, retryingImages));
            } else if (node.querySelectorAll) {
              // Or if it contains images
              node
                .querySelectorAll("img")
                .forEach((img) => imageQueue.add(img, () => handleImage(img, retryingImages)));
            }
          }
        }
      }
    }
  }

  injectUI();
  initImageRetry();

  addObserverCallback("image-repair", processMutations);
}

function handleImage(img, retryingImages) {
  if (img.dataset.retryAttached || !img.src.startsWith("https://attachments.f95zone.to/")) {
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

export function disableImageRepair() {
  if (!state.isImgRetryInjected) return;
  state.isImgRetryInjected = false;
  destroyInjectedUI();
  removeObserverCallback("image-repair");
  // Clear the queue and stop processing
  if (imageQueue) {
    imageQueue.clear();
    imageQueue = null;
  }
}
