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
    const path = e.composedPath ? e.composedPath() : [];
    const clickedInsideModal = path.includes(modalContent);
    const clickedPopover = path.some(
      (node) => node && node.classList && node.classList.contains("dark-color-popover"),
    );

    if (!clickedInsideModal && !clickedPopover) {
      closeModal();
    }
  });

  // Prevent host-page keyboard shortcuts from firing while the modal is open.
  const stopKeyLeak = (e) => {
    if (modal.style.display === "none") return;
    e.stopPropagation();
  };

  modal.addEventListener("keydown", stopKeyLeak, true);
  modal.addEventListener("keyup", stopKeyLeak, true);
  modal.addEventListener("keypress", stopKeyLeak, true);
}
