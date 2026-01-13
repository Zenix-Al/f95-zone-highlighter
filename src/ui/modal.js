import { config, debug, helpMessages } from "../constants";
import ui from "../template/ui.html?raw";
import css from "../template/css.css?raw";
import { initModalUi } from "../cores/init";
import { debugLog } from "../utils/debugOutput";
export function injectButton() {
  const button = document.createElement("button");
  button.textContent = "⚙";
  button.id = "tag-config-button";
  button.addEventListener("click", () => openModal());
  document.body.appendChild(button);
}
const MAX_TOASTS = 4;
const TOAST_DURATION = 2000;

export function showToast(message, duration = TOAST_DURATION) {
  let container = document.getElementById("toast-container");

  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
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

export function openModal() {
  initModalUi();
  changeHelpMsg();
  document.getElementById("tag-config-modal").style.display = "block";
}
export function closeModal() {
  document.getElementById("tag-config-modal").style.display = "none";
}

export function injectModal() {
  const modal = document.createElement("div");
  modal.id = "tag-config-modal";
  modal.innerHTML = `${ui}`;
  document.body.appendChild(modal);
  const visibility = document.getElementById("config-visibility");
  if (visibility) visibility.checked = config.configVisibility;

  const modalContent = modal.querySelector(".modal-content");

  modal.addEventListener("click", (e) => {
    if (!modalContent.contains(e.target)) {
      closeModal();
    }
  });
}

export function injectCSS() {
  const hasStyle = document.head.lastElementChild.textContent.includes("#tag-config-button");
  const customCSS = hasStyle ? document.head.lastElementChild : document.createElement("style");
  customCSS.textContent = `${css}`;
  document.head.appendChild(customCSS);
}
export function updateButtonVisibility() {
  const button = document.getElementById("tag-config-button");
  if (!button) return;

  if (config.globalSettings.configVisibility === false) {
    button.classList.add("blink-hide", "hover-reveal");

    const onEnd = () => {
      button.classList.remove("blink-hide");
      button.classList.add("hidden");
      button.removeEventListener("animationend", onEnd);
    };

    button.addEventListener("animationend", onEnd);
  } else {
    button.classList.remove("hidden", "blink-hide", "hover-reveal");
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
  const hintSpan = document.querySelector(".modal-footer-hint  .hint-text");
  if (hintSpan) {
    hintSpan.textContent = msg;
  }
  if (!helpMsgInterval) {
    helpMsgInterval = setInterval(() => {
      const el = document.querySelector(".modal-footer-hint .hint-text");
      if (el) el.textContent = getRandomStupidHelpMsg();
    }, 12000);
  }
}
