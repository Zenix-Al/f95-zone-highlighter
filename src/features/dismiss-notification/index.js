import { createStyledFeature } from "../../core/createStyledFeature.js";
import { createEnabledDisabledToast } from "../../ui/settings/metaFactory.js";
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
  settingsUi: {
    id: "dismiss-notification",
    sectionId: "global",
    metaMaps: [
      {
        dismissNotificationToggle: {
          type: "toggle",
          text: "Dismiss notifications on click",
          tooltip:
            "Clicking on a notification will dismiss it instead of navigating to the linked content.",
          config: "globalSettings.closeNotifOnClick",
          custom: () => {
            toggleNoticeDismissal();
          },
          toast: createEnabledDisabledToast("Notification dismissal"),
        },
      },
    ],
  },
});

/**
 * Toggles the notice dismissal feature based on the user's config.
 * This is the primary function used by the settings UI and loader.
 */
export function toggleNoticeDismissal() {
  dismissNotificationFeature.sync();
}
