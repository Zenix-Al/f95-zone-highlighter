import { config } from "../constants";
import { toggleCrossTabSync } from "../storage/crossTabSync";
import { updateButtonVisibility } from "../ui/modal";

export const globalSettingsMeta = {
  configVisibility: {
    type: "toggle",
    text: "Show configuration button",
    tooltip: "Show or hide the configuration button on the page",
    config: "globalSettings.configVisibility",
    effects: {
      custom: updateButtonVisibility,
      toast: (v) => `Configuration menu ${v ? "shown" : "hidden"}`,
    },
  },
  enableCrossTabSync: {
    type: "toggle",
    text: "Sync settings across tabs",
    tooltip:
      "Automatically apply changes made in other tabs(requires to refresh other tabs) experimental",
    config: "globalSettings.enableCrossTabSync",
    effects: {
      custom: () => {
        toggleCrossTabSync(config.globalSettings.enableCrossTabSync);
      },
      toast: (v) => `(experimental)Cross-tab settings sync ${v ? "enabled" : "disabled"}`,
    },
  },
};
