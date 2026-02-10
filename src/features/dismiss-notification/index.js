import { config } from "../../config";
import { enableNoticeDismissal, disableNoticeDismissal } from "./handler.js";

/**
 * Toggles the notice dismissal feature based on the user's config.
 * This is the primary function used by the settings UI and loader.
 */
export function toggleNoticeDismissal() {
  if (config.globalSettings.closeNotifOnClick) {
    enableNoticeDismissal();
  } else {
    disableNoticeDismissal();
  }
}
