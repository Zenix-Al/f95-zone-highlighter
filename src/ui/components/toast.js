import stateManager from "../../config.js";
import TIMINGS from "../../config/timings.js";

const MAX_TOASTS = 4;
const TOAST_DURATION = TIMINGS.TOAST_DISPLAY;

export function showToast(message, duration = TOAST_DURATION) {
  let container = stateManager.get("shadowRoot").getElementById("toast-container");

  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    stateManager.get("shadowRoot").appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);

  // enforce limit
  while (container.children.length > MAX_TOASTS) {
    container.firstElementChild.remove();
  }

  requestAnimationFrame(() => toast.classList.add("show"));

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 200);
  }, duration);
}
