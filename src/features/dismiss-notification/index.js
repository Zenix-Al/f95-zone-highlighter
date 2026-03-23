import { createStyledFeature } from "../../core/createStyledFeature.js";
import { enableNoticeDismissal, disableNoticeDismissal } from "./handler.js";
import featureCss from "./style.css";

/**
 * Core feature object for the notice dismissal functionality.
 */
export const dismissNotificationFeature = createStyledFeature("Dismiss Notification", {
  configPath: "globalSettings.closeNotifOnClick",
  isApplicable: ({ stateManager }) => stateManager.get("isF95Zone"),
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
  dismissNotificationFeature.sync();
}
