import stateManager from "../../config.js";
import TIMINGS from "../../config/timings.js";

const MAX_TOASTS = 4;
const TOAST_DURATION = TIMINGS.TOAST_DISPLAY;

function ensureFallbackToastContainer() {
  let container = document.getElementById("f95ue-toast-container");
  if (container) return container;

  container = document.createElement("div");
  container.id = "f95ue-toast-container";
  Object.assign(container.style, {
    position: "fixed",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "2147483647",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    pointerEvents: "none",
  });
  document.body.appendChild(container);
  return container;
}

export function showToast(message, duration = TOAST_DURATION) {
  const shadowRoot = stateManager.get("shadowRoot");
  let container = null;

  if (shadowRoot?.getElementById) {
    container = shadowRoot.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      shadowRoot.appendChild(container);
    }
  } else {
    container = ensureFallbackToastContainer();
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  if (!shadowRoot) {
    Object.assign(toast.style, {
      padding: "10px",
      backgroundColor: "#333",
      color: "#fff",
      borderRadius: "8px",
      opacity: "0",
      transform: "translateY(-10px)",
      transition: "opacity 0.3s ease, transform 0.3s ease",
    });
  }
  container.appendChild(toast);

  // enforce limit
  while (container.children.length > MAX_TOASTS) {
    container.firstElementChild.remove();
  }

  requestAnimationFrame(() => {
    toast.classList.add("show");
    if (!shadowRoot) {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    }
  });

  setTimeout(() => {
    toast.classList.remove("show");
    if (!shadowRoot) {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-10px)";
    }
    setTimeout(() => toast.remove(), 200);
  }, duration);
}
