import { retryImage } from "./retryLogic.js";
import { recordSuccess } from "../../services/metricsService.js";
import stateManager, { config } from "../../config.js";
import { updateToast } from "./ui.js";
import { addObserverCallback, removeObserverCallback } from "../../core/observer.js";
import resourceManager from "../../core/resourceManager.js";
import { createTaskQueue } from "../../core/taskQueue.js";
import TIMINGS from "../../config/timings.js";
import { injectUI, destroyInjectedUI } from "./ui.js";
import { preserveOriginalSrc } from "../../utils/helpers.js";

let imageQueue = null;

function hasPotentialImageMutations(mutationsList) {
  return mutationsList.some((mutation) => {
    for (const node of mutation.addedNodes || []) {
      if (node.nodeType !== 1) continue;
      if (node.tagName === "IMG") return true;
      if (node.querySelector?.("img")) return true;
    }
    return false;
  });
}

export function enableImageRepair() {
  if (stateManager.get("isImgRetryInjected")) return;
  stateManager.set("isImgRetryInjected", true);

  // Create a new queue instance for this feature
  // Small delay between starting each image check to avoid burst load.
  imageQueue = createTaskQueue({
    delay: TIMINGS.IMAGE_REPAIR_QUEUE_DELAY,
    name: "ImageRepairQueue",
  });

  // Register cleanup for the queue and UI
  resourceManager.register("image-repair-queue", () => {
    try {
      if (imageQueue) {
        imageQueue.clear();
        imageQueue = null;
      }
    } catch {
      // best-effort
    }
  });
  resourceManager.register("image-repair-ui", () => {
    try {
      destroyInjectedUI();
    } catch {
      // best-effort
    }
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

  addObserverCallback("image-repair", processMutations, {
    filter: hasPotentialImageMutations,
  });
}

function handleImage(img, retryingImages) {
  if (img.dataset.retryAttached || !img.src.startsWith("https://attachments.f95zone.to/")) {
    return;
  }

  preserveOriginalSrc(img);
  const start = performance.now();

  const MAX_ATTEMPTS = 10;
  const RETRY_DELAY = TIMINGS.IMAGE_RETRY_DELAY;

  function handleSuccess() {
    if (!stateManager.get("isImgRetryInjected")) return;
    const duration = performance.now() - start;
    retryingImages.delete(img);
    img.dataset.retrying = "false";
    img.dataset.retryAttached = "true";
    // Pass updateToast as a callback, consistent with retryLogic.js
    // This also removes the redundant metrics increment and separate toast update.
    recordSuccess(img, duration, () => updateToast(retryingImages, config.metrics));
  }

  function handleError() {
    if (!stateManager.get("isImgRetryInjected")) return;
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
  if (!stateManager.get("isImgRetryInjected")) return;
  stateManager.set("isImgRetryInjected", false);
  destroyInjectedUI();
  removeObserverCallback("image-repair");
  // Let ResourceManager handle cleanup for queue/UI if registered
  resourceManager.cleanup("image-repair-queue");
  resourceManager.cleanup("image-repair-ui");
}
