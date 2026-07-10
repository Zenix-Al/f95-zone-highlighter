import { openConfigTransferDialog } from "../../features/config-transfer/index.js";
import { crossTabSyncFeature } from "../../services/syncService";
import { updateButtonVisibility } from "../components/configButton";
import { createEnabledDisabledToast, createToggleSetting } from "./metaFactory";
import { showFeatureHealthBox } from "../components/featureHealth/index.js";
import { syncHelpMessageFooter } from "../components/helpMessage.js";
import { contributeToSection } from "../settingsRuntime/sectionsRegistry.js";

export const globalSettingsMeta = {
  configVisibility: createToggleSetting({
    text: "Show configuration button",
    tooltip: "Show or hide the configuration button on the page",
    config: "globalSettings.configVisibility",
    custom: updateButtonVisibility,
    toast: createEnabledDisabledToast("Configuration menu", {
      enabled: "shown",
      disabled: "hidden",
    }),
  }),
  enableCrossTabSync: createToggleSetting({
    text: "Sync settings across tabs",
    tooltip:
      "Automatically apply changes made in other tabs(requires to refresh other tabs) experimental",
    config: "globalSettings.enableCrossTabSync",
    custom: () => {
      crossTabSyncFeature.toggle(crossTabSyncFeature.isEnabled());
    },
    toast: createEnabledDisabledToast("(experimental)Cross-tab settings sync"),
  }),
  configTransfer: {
    type: "button",
    text: "Import / export settings",
    buttonText: "Open",
    tooltip: "Open JSON import/export tools",
    onClick: openConfigTransferDialog,
  },
  featureHealth: {
    type: "button",
    text: "Feature health",
    buttonText: "Run check",
    tooltip: "Run a diagnostic that reports feature and installed add-on health states",
    onClick: () => {
      try {
        showFeatureHealthBox();
      } catch (err) {
        console.warn("Failed to show feature health box:", err);
      }
    },
  },
  disableHelpMessage: createToggleSetting({
    text: "Disable help message (dont)",
    tooltip: "y u do dis?",
    config: "globalSettings.disableHelpMessage",
    custom: () => {
      syncHelpMessageFooter();
    },
    toast: createEnabledDisabledToast("Help message", {
      enabled: "disabled",
      disabled: "enabled",
    }),
  }),
};
contributeToSection("global", globalSettingsMeta, "base:global");
