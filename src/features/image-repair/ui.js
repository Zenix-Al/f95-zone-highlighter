import imgRetryUi from "./assets/imgRetryUi.html?raw";

let isUpdating = false;
let pendingUpdate = false;
let imgRetryTimeoutContainer;

/**
 * Injects the image retry toast UI into the page, hidden by default.
 * This component lives in the main document, not the shadow DOM.
 */
export function injectUI() {
  if (document.getElementById("img-retry-toast")) return;

  const wrapper = document.createElement("div");
  wrapper.id = "image-retry-toast-wrapper";
  wrapper.innerHTML = imgRetryUi;

  document.body.appendChild(wrapper);
  const toastEl = document.getElementById("img-retry-toast");
  if (toastEl) {
    toastEl.style.display = "none";
  }
}

/**
 * Removes the injected image retry toast UI from the page.
 */
export function destroyInjectedUI() {
  const wrapper = document.getElementById("image-retry-toast-wrapper");
  if (wrapper) {
    wrapper.remove();
  }
}

/**
 * Updates the content and visibility of the image retry toast.
 * @param {Set} retryingImages
 * @param {object} metrics
 */
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
  }, 500);
}
