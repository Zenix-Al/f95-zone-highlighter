import { createFeature } from "../../core/featureFactory.js";
import { config } from "../../config.js";
import { enableNoticeDismissal, disableNoticeDismissal } from "./handler.js";
import featureCss from "./style.css";
import { acquireStyle, removeStyle } from "../../core/styleRegistry.js";

const DISMISS_NOTICE_STYLE_ID = "feature-dismiss-notification";

/**
 * Core feature object for the notice dismissal functionality.
 */
export const dismissNotificationFeature = createFeature("Dismiss Notification", {
  configPath: "globalSettings.closeNotifOnClick",
  enable: () => {
    acquireStyle(DISMISS_NOTICE_STYLE_ID, featureCss, "document");
    enableNoticeDismissal();
  },
  disable: () => {
    disableNoticeDismissal();
    removeStyle(DISMISS_NOTICE_STYLE_ID);
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
