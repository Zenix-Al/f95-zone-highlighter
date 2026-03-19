import stateManager from "../../config.js";
import ui_html from "../assets/ui.html";
import { initModalUi } from "../settings/index.js";
import { startHelpMessageCycle, stopHelpMessageCycle } from "./helpMessage.js";

export async function openModal() {
  await initModalUi();
  startHelpMessageCycle();
  stateManager.get("shadowRoot").getElementById("tag-config-modal").style.display = "block";
}
export function closeModal() {
  stateManager.get("shadowRoot").getElementById("tag-config-modal").style.display = "none";
  stopHelpMessageCycle();
}

export function injectModal() {
  const modal = document.createElement("div");
  modal.id = "tag-config-modal";
  modal.innerHTML = `${ui_html}`;
  stateManager.get("shadowRoot").appendChild(modal);

  const modalContent = modal.querySelector(".modal-content");

  modal.addEventListener("click", (e) => {
    // Close modal if the click is on the backdrop, not the content.
    // Ignore clicks that land inside an open dark-color picker popover.
    if (!modalContent.contains(e.target) && !e.target.closest(".dark-color-popover")) {
      closeModal();
    }
  });
}
