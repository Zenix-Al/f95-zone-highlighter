import { stateManager } from "../../config.js";
import { TIMINGS } from "../../config/timings.js";
import { createEl } from "../../core/dom.js";

const MAX_TOASTS = 4;
const TOAST_DURATION = TIMINGS.TOAST_DISPLAY;
const pendingToasts = [];

function ensureFallbackToastContainer() {
  if (typeof document === "undefined") return null;
  if (!document.body) return null;

  let container = document.getElementById("toast-container");
  if (container) return container;

  container = createEl("div", { attrs: { id: "toast-container" } });
  document.body.appendChild(container);
  return container;
}

function resolveToastContainer() {
  const shadowRoot = stateManager.get("shadowRoot");

  if (shadowRoot?.getElementById) {
    let container = shadowRoot.getElementById("toast-container");
    if (!container) {
      container = createEl("div", { attrs: { id: "toast-container" } });
      shadowRoot.appendChild(container);
    }
    return container;
  }

  return ensureFallbackToastContainer();
}

function renderToast({ message, duration = TOAST_DURATION, type = "info" }) {
  const container = resolveToastContainer();
  if (!container) return false;

  const colors = {
    success: "#4CAF50",
    error: "#F44336",
    warning: "#FF9800",
    info: "",
  };
  const toast = createEl("div", {
    className: "toast",
    text: message,
    style: { backgroundColor: colors[type] || "" },
  });
  container.appendChild(toast);

  // enforce limit
  while (container.children.length > MAX_TOASTS) {
    container.firstElementChild.remove();
  }

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 200);
  }, duration);

  return true;
}

function normalizeToastRequest(message, duration = TOAST_DURATION, type = "info") {
  return {
    message: String(message || ""),
    duration: Number.isFinite(Number(duration)) ? Number(duration) : TOAST_DURATION,
    type: String(type || "info").trim() || "info",
  };
}

export function showToast(message, duration = TOAST_DURATION, type = "info") {
  const request = normalizeToastRequest(message, duration, type);
  if ((typeof document === "undefined" || !document.body) && !stateManager.get("shadowRoot")) {
    pendingToasts.push(request);
    return;
  }

  if (!renderToast(request)) {
    pendingToasts.push(request);
  }
}

export function flushQueuedToasts() {
  if (pendingToasts.length === 0) return 0;

  const queued = pendingToasts.splice(0, pendingToasts.length);
  let flushed = 0;

  for (let index = 0; index < queued.length; index += 1) {
    const request = queued[index];
    if (renderToast(request)) {
      flushed += 1;
      continue;
    }

    pendingToasts.unshift(...queued.slice(index));
    break;
  }

  return flushed;
}
