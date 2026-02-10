let isUpdating = false;
let pendingUpdate = false;
let imgRetryTimeoutContainer;
export function updateToast(retryingImages, metrics) {
  const imgRetryToastEl = document.querySelector(".img-retry-toast");
  if (!imgRetryToastEl) return;

  if (isUpdating) {
    pendingUpdate = true;
    return;
  }

  isUpdating = true;

  if (retryingImages.size === 0) {
    imgRetryToastEl.style.display = "none";
  } else {
    imgRetryToastEl.style.display = "flex";
    imgRetryToastEl.querySelector(".img-retry-count").textContent = retryingImages.size;
    imgRetryToastEl.querySelector(".img-retry-plural").textContent =
      retryingImages.size > 1 ? "s" : "";
    imgRetryToastEl.querySelector(".img-retry-succeeded").textContent = metrics.succeeded;
    imgRetryToastEl.querySelector(".img-retry-failed").textContent = metrics.failed;
    imgRetryToastEl.querySelector(".img-retry-avg").textContent = metrics.avgCache.toFixed(1);
  }

  imgRetryTimeoutContainer = setTimeout(() => {
    isUpdating = false;
    if (pendingUpdate) {
      pendingUpdate = false;
      updateToast(retryingImages, metrics);
    }
  }, 500); // adjust delay if needed
}

export function disableToast() {
  clearTimeout(imgRetryTimeoutContainer);
  const imgRetryToastEl = document.querySelector(".img-retry-toast");
  if (!imgRetryToastEl) return;
  pendingUpdate = false;
  isUpdating = false;
  imgRetryToastEl.style.display = "none";
}
