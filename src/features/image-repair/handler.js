import { recordFail, recordSuccess } from "../../services/metricsService.js";
import { notifyAllDone, notifyMaxAttempts } from "../../services/notificationService.js";
import stateManager, { config } from "../../config.js";
import { updateToast, injectUI, destroyInjectedUI } from "./ui.js";
import { addObserverCallback, removeObserverCallback } from "../../core/observer.js";
import resourceManager from "../../core/resourceManager.js";
import { createTaskQueue } from "../../core/taskQueue.js";
import TIMINGS from "../../config/timings.js";
import { preserveOriginalSrc } from "../../utils/helpers.js";

const MAX_ATTEMPTS = 10;

let imageQueue = null;
let retryingImages = new Set();

const notifInfo = {
  isErrorNotified: false,
  isCompleteNotified: false,
};

function resetNotifInfo() {
  notifInfo.isErrorNotified = false;
  notifInfo.isCompleteNotified = false;
}

function hasPotentialImageMutations(mutationsList) {
  return mutationsList.some((mutation) => {
    for (const node of mutation.addedNodes || []) {
      if (node.nodeType !== 1) continue;
      if (node.tagName === "IMG") {
        const src = String(node.src || "");
        if (src.startsWith("https://attachments.f95zone.to/")) return true;
        continue;
      }
      const imgs = node.querySelectorAll?.("img") || [];
      for (const img of imgs) {
        if (String(img.src || "").startsWith("https://attachments.f95zone.to/")) return true;
      }
    }
    return false;
  });
}

function processMutations(mutationsList) {
  for (const mutation of mutationsList) {
    if (mutation.type !== "childList") continue;

    for (const node of mutation.addedNodes) {
      if (node.nodeType !== 1) continue;

      if (node.tagName === "IMG") {
        const src = String(node.src || "");
        if (src.startsWith("https://attachments.f95zone.to/") && !node.dataset.retryAttached) {
          imageQueue.add(node, () => handleImage(node));
        }
      } else {
        const imgs = node.querySelectorAll?.("img") || [];
        for (const img of imgs) {
          const src = String(img.src || "");
          if (src.startsWith("https://attachments.f95zone.to/") && !img.dataset.retryAttached) {
            imageQueue.add(img, () => handleImage(img));
          }
        }
      }
    }
  }
}

function markDone(img, success, duration) {
  if (!stateManager.get("isImgRetryInjected")) return;
  retryingImages.delete(img);
  img.dataset.retrying = "false";
  img.dataset.retryAttached = "true";

  if (success) {
    recordSuccess(img, duration, () => updateToast(retryingImages, config.metrics));
    if (retryingImages.size === 0 && !notifInfo.isCompleteNotified) {
      notifInfo.isCompleteNotified = true;
      notifyAllDone();
    }
  } else {
    recordFail(() => updateToast(retryingImages, config.metrics));
  }

  updateToast(retryingImages, config.metrics);
}

function doRetry(img, start, attempt = 0) {
  config.metrics.retried++;
  retryingImages.add(img);
  updateToast(retryingImages, config.metrics);

  img.src = img.dataset.originalSrc + "?retry=" + Date.now();

  setTimeout(() => {
    if (!stateManager.get("isImgRetryInjected")) return;

    if (img.complete && img.naturalWidth > 0) {
      markDone(img, true, performance.now() - start);
      return;
    }

    if (attempt >= MAX_ATTEMPTS) {
      markDone(img, false);
      if (!notifInfo.isErrorNotified) {
        notifInfo.isErrorNotified = true;
        notifyMaxAttempts(MAX_ATTEMPTS);
      }
      return;
    }

    doRetry(img, start, attempt + 1);
  }, TIMINGS.IMAGE_RETRY_DELAY);
}

function handleImage(img) {
  if (img.dataset.retryAttached || !img.src.startsWith("https://attachments.f95zone.to/")) return;

  preserveOriginalSrc(img);
  const start = performance.now();

  function onLoad() {
    if (!stateManager.get("isImgRetryInjected")) return;
    const duration = performance.now() - start;
    retryingImages.delete(img);
    img.dataset.retrying = "false";
    img.dataset.retryAttached = "true";
    recordSuccess(img, duration, () => updateToast(retryingImages, config.metrics));
  }

  function onError() {
    if (!stateManager.get("isImgRetryInjected")) return;
    if (img.dataset.retrying !== "true") {
      img.dataset.retrying = "true";
      doRetry(img, start);
    }
  }

  if (img.complete) {
    if (img.naturalWidth > 0) onLoad();
    else onError();
  } else {
    img.addEventListener("load", onLoad, { once: true });
    img.addEventListener("error", onError, { once: true });
  }
}

export function enableImageRepair() {
  retryingImages = new Set();
  resetNotifInfo();

  imageQueue = createTaskQueue({
    delay: TIMINGS.IMAGE_REPAIR_QUEUE_DELAY,
    name: "ImageRepairQueue",
  });

  resourceManager.register("image-repair-queue", () => {
    imageQueue?.clear();
    imageQueue = null;
  });

  injectUI();
  // Only enqueue candidate images (attachments from the host and not already processed)
  document.querySelectorAll("img").forEach((img) => {
    const src = String(img.src || "");
    if (src.startsWith("https://attachments.f95zone.to/") && !img.dataset.retryAttached) {
      imageQueue.add(img, () => handleImage(img));
    }
  });
  updateToast(retryingImages, config.metrics);

  addObserverCallback("image-repair", processMutations, {
    filter: hasPotentialImageMutations,
  });
}

export function disableImageRepair() {
  destroyInjectedUI();
  removeObserverCallback("image-repair");
  resourceManager.cleanup("image-repair-queue");
}
