import { config } from "../constants";
import ui from "../template/ui.html?raw";
import css from "../template/css.css?raw";
import { checkForUpdates, initModalUi } from "../cores/init";
export function injectButton() {
  const button = document.createElement("button");
  button.textContent = "⚙";
  button.id = "tag-config-button";
  button.addEventListener("click", () => openModal());
  document.body.appendChild(button);
}
export function showToast(message, duration = 2000) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}
export function openModal() {
  initModalUi();
  document.getElementById("tag-config-modal").style.display = "block";
}
export function closeModal() {
  document.getElementById("tag-config-modal").style.display = "none";
  checkForUpdates();
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
    // Blink 3 times
    let blinkCount = 0;
    const maxBlinks = 3;
    const blinkInterval = 400; // ms

    if (button.blinkIntervalId) {
      clearInterval(button.blinkIntervalId);
    }
    button.classList.add("hidden");

    button.blinkIntervalId = setInterval(() => {
      button.classList.toggle("hidden");

      blinkCount++;
      if (blinkCount >= maxBlinks * 2) {
        clearInterval(button.blinkIntervalId);
        button.classList.add("hidden");
        button.blinkIntervalId = undefined;
      }
    }, blinkInterval);
  } else {
    // Show button normally
    if (button.blinkIntervalId) {
      clearInterval(button.blinkIntervalId);
      button.blinkIntervalId = undefined;
    }
    button.classList.remove("hidden");
  }
}
