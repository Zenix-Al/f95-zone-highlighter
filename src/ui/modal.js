import { config, state } from "../constants";
import { updateTags } from "../data/tags";
import { renderExcluded, renderPreferred } from "../renderer/searchTags";
import ui from "../template/ui.html?raw";
import css from "../template/css.css?raw";
import { renderColorConfig } from "../renderer/color";
import { renderOverlaySettings } from "../renderer/overlay";
import { renderThreadSettings } from "../renderer/threadSettings";
import { processAllTiles } from "../cores/latest";
import { processThreadTags } from "../cores/thread";
import { renderLatest } from "../renderer/latestSettings";
import { injectListener } from "./listeners";
export function injectButton() {
  const button = document.createElement("button");
  button.textContent = "⚙️";
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
  if (!state.modalInjected) {
    state.modalInjected = true;
    injectModal();
    injectListener();
  }
  if (!state.colorRendered) {
    state.colorRendered = true;
    renderColorConfig();
  }
  if (!state.overlayRendered) {
    state.overlayRendered = true;
    renderOverlaySettings();
  }
  if (!state.threadSettingsRendered) {
    state.threadSettingsRendered = true;
    renderThreadSettings();
    renderLatest();
  }
  document.getElementById("tag-config-modal").style.display = "block";
  renderPreferred();
  renderExcluded();
  updateTags();
}
export function closeModal() {
  document.getElementById("tag-config-modal").style.display = "none";
  if (state.reapplyOverlay) {
    if (state.isThread) {
      processThreadTags();
    } else if (state.isLatest) {
      processAllTiles(true);
    }
  }
}

export function injectModal() {
  const modal = document.createElement("div");
  modal.id = "tag-config-modal";
  modal.innerHTML = `${ui}`;
  document.body.appendChild(modal);
  const visibility = document.getElementById("config-visibility");
  if (visibility) visibility.checked = config.configVisibility;
  const minVer = document.getElementById("min-version");
  if (minVer) minVer.value = config.minVersion;
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

  if (config.configVisibility === false) {
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
