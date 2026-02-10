import { config } from "../../config";

/**
 * Toggles the 'dense grid' layout on the Latest Updates page by adding/removing a CSS class.
 */
export function toggleDenseLatestGrid() {
  document.documentElement.classList.toggle("latest-dense", config.latestSettings.denseLatestGrid);
}
