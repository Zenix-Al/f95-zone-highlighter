import { config } from "../../config";
import { enableImageRepair, disableImageRepair } from "./handler.js";
import { injectUI, destroyInjectedUI } from "./ui.js";

/**
 * Toggles the image repair feature based on the user's config.
 * This is the primary function used by the settings UI and loader.
 */
export function toggleImageRepair() {
  if (config.threadSettings.imgRetry) {
    injectUI();
    enableImageRepair();
  } else {
    disableImageRepair();
    destroyInjectedUI();
  }
}
