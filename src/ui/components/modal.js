import { stateManager } from "../../config.js";
import ui_html from "../assets/ui.html";
import { hideTagSearchResults } from "./tag-search";
import { ensureModalCss } from "../helpers/cssInjector.js";
import { initModalUi } from "../settings/index.js";

export async function openModal() {
  ensureModalCss();
  await initModalUi();
  stateManager.get("shadowRoot").getElementById("tag-config-modal").style.display = "block";
}
export function closeModal() {
  const shadowRoot = stateManager.get("shadowRoot");
  hideTagSearchResults(shadowRoot?.getElementById("search-results"));
  shadowRoot.getElementById("tag-config-modal").style.display = "none";
}

export function injectModal() {
  const modal = document.createElement("div");
  modal.id = "tag-config-modal";
  modal.innerHTML = `${ui_html}`;
  stateManager.get("shadowRoot").appendChild(modal);

  const modalContent = modal.querySelector(".modal-content");

  modal.addEventListener("click", (e) => {
    // Close modal if the click is on the backdrop, not the content.
    const path = e.composedPath ? e.composedPath() : [];
    const clickedInsideModal = path.includes(modalContent);

    if (!clickedInsideModal) {
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
