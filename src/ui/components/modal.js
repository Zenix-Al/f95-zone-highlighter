import { config, helpMessages, state } from "../../config";
import ui_html from "../assets/ui.html";
import ui_css from "../assets/css.css";
import web_css from "../assets/web.css";
import { initModalUi } from "../settings/index.js";
import { debugLog } from "../../core/logger";

export function injectButton() {
  const button = document.createElement("button");
  button.textContent = "⚙";
  button.id = "tag-config-button";
  button.addEventListener("click", () => openModal());
  state.shadowRoot.appendChild(button);
}
const MAX_TOASTS = 4;
const TOAST_DURATION = 2000;

export function showToast(message, duration = TOAST_DURATION) {
  let container = state.shadowRoot.getElementById("toast-container");

  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    state.shadowRoot.appendChild(container);
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

export async function openModal() {
  await initModalUi();
  changeHelpMsg();
  state.shadowRoot.getElementById("tag-config-modal").style.display = "block";
}
export function closeModal() {
  state.shadowRoot.getElementById("tag-config-modal").style.display = "none";
  // Stop the help message from changing in the background to prevent a resource leak.
  if (helpMsgInterval) {
    clearInterval(helpMsgInterval);
    helpMsgInterval = null;
    debugLog("HelpMsg", "Stopped help message interval.");
  }
}

export function injectModal() {
  const modal = document.createElement("div");
  modal.id = "tag-config-modal";
  modal.innerHTML = `${ui_html}`;
  state.shadowRoot.appendChild(modal);
  const visibility = state.shadowRoot.getElementById("config-visibility");
  if (visibility) visibility.checked = config.configVisibility;

  const modalContent = modal.querySelector(".modal-content");

  modal.addEventListener("click", (e) => {
    if (!modalContent.contains(e.target)) {
      closeModal();
    }
  });
}

export function injectCSS() {
  // Inject UI-specific styles into the Shadow DOM for encapsulation
  const uiStyle = document.createElement("style");
  uiStyle.textContent = ui_css;
  state.shadowRoot.appendChild(uiStyle);

  // Inject styles that affect the main page into the document's head
  const webStyle = document.createElement("style");
  webStyle.textContent = web_css;
  document.head.appendChild(webStyle);
}
export function updateButtonVisibility() {
  const button = state.shadowRoot.getElementById("tag-config-button");
  if (!button) return;

  if (config.globalSettings.configVisibility === false) {
    button.classList.add("blink-hide");

    const onEnd = () => {
      button.classList.remove("blink-hide");
      button.classList.add("hidden");
      button.removeEventListener("animationend", onEnd);
    };

    button.addEventListener("animationend", onEnd);
  } else {
    button.classList.remove("hidden", "blink-hide");
  }
}

let helpMsgInterval = null;
export function changeHelpMsg() {
  function getRandomStupidHelpMsg() {
    const randomIndex = Math.floor(Math.random() * helpMessages.length);
    return helpMessages[randomIndex];
  }
  const msg = getRandomStupidHelpMsg();
  debugLog("getRandomStupidHelpMsg", `Selected help message: ${msg}`);
  const hintSpan = state.shadowRoot.querySelector(".modal-footer-hint  .hint-text");
  if (hintSpan) {
    hintSpan.textContent = msg;
  }
  if (!helpMsgInterval) {
    helpMsgInterval = setInterval(() => {
      const el = state.shadowRoot.querySelector(".modal-footer-hint .hint-text");
      if (el) el.textContent = getRandomStupidHelpMsg();
    }, 12000);
  }
}
