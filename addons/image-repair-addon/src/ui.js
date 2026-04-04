export function createImageRepairUi({ addonId, toastId, wrapperId, toastUpdateInterval, metrics }) {
  const styleId = `addon-style-${addonId}`;

  const css = `
    #${wrapperId} {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 99999;
      pointer-events: none;
    }
    #${toastId} {
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      padding: 10px 15px;
      border-radius: 8px;
      font-family: sans-serif;
      font-size: 13px;
      display: none;
      align-items: center;
      gap: 10px;
    }
    #${toastId} .img-retry-spinner {
      border: 2px solid #fff;
      border-top: 2px solid transparent;
      border-radius: 50%;
      width: 14px;
      height: 14px;
      display: inline-block;
      animation: img-retry-spin 1s linear infinite;
    }
    @keyframes img-retry-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    #${toastId} .img-retry-stats {
      margin-left: 10px;
      opacity: 0.8;
    }
  `;

  let isToastUpdating = false;
  let pendingToastUpdate = false;
  let toastUpdateTimer = null;

  function injectUi() {
    if (document.getElementById(toastId)) return;

    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = css;
      document.head.appendChild(style);
    }

    const spinner = document.createElement("span");
    spinner.className = "img-retry-spinner";

    const count = document.createElement("span");
    count.className = "img-retry-count";
    count.textContent = "0";

    const plural = document.createElement("span");
    plural.className = "img-retry-plural";

    const succeeded = document.createElement("span");
    succeeded.className = "img-retry-succeeded";
    succeeded.textContent = "0";

    const failed = document.createElement("span");
    failed.className = "img-retry-failed";
    failed.textContent = "0";

    const avg = document.createElement("span");
    avg.className = "img-retry-avg";
    avg.textContent = "0";

    const stats = document.createElement("div");
    stats.className = "img-retry-stats";
    stats.append(
      document.createTextNode("Success: "),
      succeeded,
      document.createTextNode(" | Fail: "),
      failed,
      document.createTextNode(" | Avg: "),
      avg,
      document.createTextNode(" ms"),
    );

    const toast = document.createElement("div");
    toast.id = toastId;
    toast.style.display = "none";
    toast.append(
      spinner,
      document.createTextNode("Retrying "),
      count,
      document.createTextNode(" image"),
      plural,
      document.createTextNode("..."),
      stats,
    );

    const wrapper = document.createElement("div");
    wrapper.id = wrapperId;
    wrapper.appendChild(toast);
    document.body.appendChild(wrapper);
  }

  function destroyUi() {
    document.getElementById(wrapperId)?.remove();
    document.getElementById(styleId)?.remove();
    clearTimeout(toastUpdateTimer);
    toastUpdateTimer = null;
    isToastUpdating = false;
    pendingToastUpdate = false;
  }

  function updateToast(retryingImages) {
    const toast = document.getElementById(toastId);
    if (!toast) return;

    if (isToastUpdating) {
      pendingToastUpdate = true;
      return;
    }

    isToastUpdating = true;

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

    toastUpdateTimer = setTimeout(() => {
      isToastUpdating = false;
      if (pendingToastUpdate) {
        pendingToastUpdate = false;
        updateToast(retryingImages);
      }
    }, toastUpdateInterval);
  }

  return {
    injectUi,
    destroyUi,
    updateToast,
  };
}
