import stateManager from "../../config.js";
import { closeModal } from "./modal";
import { resetColor } from "./settingsActions.js";

export function handleModalClick(e) {
  // Use closest to handle clicks on child elements of a button
  const target = e.target.closest("[id]");
  if (!target) return;

  switch (target.id) {
    case "close-modal":
      closeModal();
      break;
    case "reset-color":
      resetColor();
      break;
  }
}

export function handleOutsideSearchClick(e) {
  if (!stateManager.get("shadowRoot")) return;
  const input = stateManager.get("shadowRoot").getElementById("tags-search");
  const results = stateManager.get("shadowRoot").getElementById("search-results");
  if (!input || !results) return;

  // Use composedPath to correctly detect clicks inside/outside the shadow DOM
  const path = e.composedPath();
  if (!path.includes(input) && !path.includes(results)) {
    results.style.display = "none";
  }
}
