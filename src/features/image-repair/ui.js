import { SELECTORS } from "../../config/selectors.js";
import TIMINGS from "../../config/timings.js";
import { createEl } from "../../core/dom.js";

let isUpdating = false;
let pendingUpdate = false;
let imgRetryTimeoutContainer;

function buildToastElement() {
  const spinner = createEl("span", { className: "img-retry-spinner" });

  const count = createEl("span", { className: "img-retry-count", text: "0" });

  const plural = createEl("span", { className: "img-retry-plural" });

  const succeeded = createEl("span", { className: "img-retry-succeeded", text: "0" });
  const failed = createEl("span", { className: "img-retry-failed", text: "0" });
  const avg = createEl("span", { className: "img-retry-avg", text: "0" });

  const stats = createEl("div", { className: "img-retry-stats" });
  stats.append(
    document.createTextNode("Success: "),
    succeeded,
    document.createTextNode(" | Fail: "),
    failed,
    document.createTextNode(" | Avg: "),
    avg,
    document.createTextNode(" ms"),
  );

  const toast = createEl("div", {
    attrs: { id: SELECTORS.IMAGE_REPAIR.TOAST_ID },
    className: "img-retry-toast",
  });

  const frag = document.createDocumentFragment();
  frag.append(
    spinner,
    document.createTextNode("Retrying "),
    count,
    document.createTextNode(" image"),
    plural,
    document.createTextNode("..."),
    stats,
  );
  toast.appendChild(frag);

  return toast;
}

export function injectUI() {
  if (document.getElementById(SELECTORS.IMAGE_REPAIR.TOAST_ID)) return;
  const toast = buildToastElement();
  toast.style.display = "none";

  const wrapper = createEl("div", { attrs: { id: SELECTORS.IMAGE_REPAIR.WRAPPER_ID } });
  wrapper.appendChild(toast);

  document.body.appendChild(wrapper);
}

export function destroyInjectedUI() {
  const wrapper = document.getElementById(SELECTORS.IMAGE_REPAIR.WRAPPER_ID);
  if (wrapper) wrapper.remove();

  if (imgRetryTimeoutContainer) {
    clearTimeout(imgRetryTimeoutContainer);
    imgRetryTimeoutContainer = null;
  }
}

export function updateToast(retryingImages, metrics) {
  const toast = document.getElementById(SELECTORS.IMAGE_REPAIR.TOAST_ID);
  if (!toast) return;

  if (isUpdating) {
    pendingUpdate = true;
    return;
  }

  isUpdating = true;

  if (retryingImages.size === 0) {
    toast.style.display = "none";
  } else {
    toast.style.display = "flex";
    toast.querySelector(".img-retry-count").textContent = retryingImages.size;
    toast.querySelector(".img-retry-plural").textContent = retryingImages.size > 1 ? "s" : "";
    toast.querySelector(".img-retry-succeeded").textContent = metrics.succeeded;
    toast.querySelector(".img-retry-failed").textContent = metrics.failed;
    toast.querySelector(".img-retry-avg").textContent = metrics.avgCache.toFixed(1);
  }

  imgRetryTimeoutContainer = setTimeout(() => {
    isUpdating = false;
    if (pendingUpdate) {
      pendingUpdate = false;
      updateToast(retryingImages, metrics);
    }
  }, TIMINGS.IMAGE_RETRY_TOAST_INTERVAL);
}
