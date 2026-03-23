import stateManager from "../../config.js";
import TIMINGS from "../../config/timings.js";
import { createEl } from "../../core/dom.js";

const MAX_TOASTS = 4;
const TOAST_DURATION = TIMINGS.TOAST_DISPLAY;

function ensureFallbackToastContainer() {
  let container = document.getElementById("toast-container");
  if (container) return container;

  container = createEl("div", { attrs: { id: "toast-container" } });
  document.body.appendChild(container);
  return container;
}

export function showToast(message, duration = TOAST_DURATION) {
  const shadowRoot = stateManager.get("shadowRoot");
  let container = null;

  if (shadowRoot?.getElementById) {
    container = shadowRoot.getElementById("toast-container");
    if (!container) {
      container = createEl("div", { attrs: { id: "toast-container" } });
      shadowRoot.appendChild(container);
    }
  } else {
    container = ensureFallbackToastContainer();
  }

  const toast = createEl("div", { className: "toast", text: message });
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
}
