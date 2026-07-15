import { openConfigTransferDialog } from "../configTransfer/index.js";
import { updateButtonVisibility } from "../components/configButton";
import { createEnabledDisabledToast, createToggleSetting } from "./metaFactory";
import { showFeatureHealthBox } from "../components/featureHealth/index.js";
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
};
contributeToSection("global", globalSettingsMeta, "base:global");
