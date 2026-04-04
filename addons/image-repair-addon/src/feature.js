import { createQueue } from "./queue.js";

export function createImageRepairFeature({
  imageHost,
  queueDelay,
  retryDelay,
  maxAttempts,
  isEnabled,
  recordSuccess,
  recordFail,
  notifyAllDone,
  notifyMaxAttempts,
  ui,
}) {
  let imageQueue = null;
  let retryingImages = new Set();

  const notifInfo = { isErrorNotified: false, isCompleteNotified: false };

  function resetNotifInfo() {
    notifInfo.isErrorNotified = false;
    notifInfo.isCompleteNotified = false;
  }

  function markDone(img, success, duration) {
    retryingImages.delete(img);
    img.dataset.retrying = "false";
    img.dataset.retryAttached = "true";

    if (success) {
      recordSuccess(duration);
      if (retryingImages.size === 0 && !notifInfo.isCompleteNotified) {
        notifInfo.isCompleteNotified = true;
        notifyAllDone();
      }
    } else {
      recordFail();
    }

    ui.updateToast(retryingImages);
  }

  function doRetry(img, start, attempt) {
    retryingImages.add(img);
    ui.updateToast(retryingImages);
    img.src = img.dataset.originalSrc + "?retry=" + Date.now();

    setTimeout(() => {
      if (!isEnabled()) return;

      if (img.complete && img.naturalWidth > 0) {
        markDone(img, true, performance.now() - start);
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

      doRetry(img, start, attempt + 1);
    }, retryDelay);
  }

  function handleImage(img) {
    if (img.dataset.retryAttached || !String(img.src || "").startsWith(imageHost)) return;

    if (!img.dataset.originalSrc) {
      img.dataset.originalSrc = img.src;
    }

    const start = performance.now();
    let didRetry = false;

    function onLoad() {
      retryingImages.delete(img);
      img.dataset.retrying = "false";
      img.dataset.retryAttached = "true";
      if (!didRetry) return;

      recordSuccess(performance.now() - start);

      if (retryingImages.size === 0 && !notifInfo.isCompleteNotified) {
        notifInfo.isCompleteNotified = true;
        notifyAllDone();
      }

      ui.updateToast(retryingImages);
    }

    function onError() {
      if (!isEnabled()) return;
      if (img.dataset.retrying !== "true") {
        didRetry = true;
        img.dataset.retrying = "true";
        doRetry(img, start, 0);
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

  function enqueueObservedNodes(nodes) {
    if (!imageQueue) return;

    for (const node of Array.isArray(nodes) ? nodes : []) {
      if (!node || node.nodeType !== 1) continue;

      if (node.tagName === "IMG") {
        const src = String(node.src || "");
        if (src.startsWith(imageHost) && !node.dataset.retryAttached) {
          imageQueue.add(node, () => handleImage(node));
        }
        continue;
      }

      const imgs = node.querySelectorAll ? node.querySelectorAll("img") : [];
      for (const img of imgs) {
        const src = String(img.src || "");
        if (src.startsWith(imageHost) && !img.dataset.retryAttached) {
          imageQueue.add(img, () => handleImage(img));
        }
      }
    }
  }

  function enable() {
    retryingImages = new Set();
    resetNotifInfo();
    imageQueue = createQueue(queueDelay);
    ui.injectUi();

    document.querySelectorAll("img").forEach((img) => {
      const src = String(img.src || "");
      if (src.startsWith(imageHost) && !img.dataset.retryAttached) {
        imageQueue.add(img, () => handleImage(img));
      }
    });

    ui.updateToast(retryingImages);
  }

  function disable() {
    if (imageQueue) {
      imageQueue.clear();
      imageQueue = null;
    }

    ui.destroyUi();
  }

  return {
    enable,
    disable,
    enqueueObservedNodes,
  };
}
