import { createStyledFeature } from "../../core/createStyledFeature.js";
import { config } from "../../config.js";
import { enableNoticeDismissal, disableNoticeDismissal } from "./handler.js";
import featureCss from "./style.css";

/**
 * Core feature object for the notice dismissal functionality.
 */
export const dismissNotificationFeature = createStyledFeature("Dismiss Notification", {
  configPath: "globalSettings.closeNotifOnClick",
  styleCss: featureCss,
  enable: () => {
    enableNoticeDismissal();
  },
  disable: () => {
    disableNoticeDismissal();
  },
});

/**
 * Toggles the notice dismissal feature based on the user's config.
 * This is the primary function used by the settings UI and loader.
 */
export function toggleNoticeDismissal() {
  if (config.globalSettings.closeNotifOnClick) {
    dismissNotificationFeature.enable();
  } else {
    dismissNotificationFeature.disable();
  }
}
