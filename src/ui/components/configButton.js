import stateManager, { config } from "../../config.js";
import { openModal } from "./modal.js";

export function injectButton() {
  const button = document.createElement("button");
  button.textContent = "⚙";
  button.id = "tag-config-button";
  button.addEventListener("click", () => openModal());
  stateManager.get('shadowRoot').appendChild(button);
}

export function updateButtonVisibility() {
  const button = stateManager.get('shadowRoot').getElementById("tag-config-button");
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
