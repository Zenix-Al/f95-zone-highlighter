import { openConfigTransferDialog } from "../../features/config-transfer/index.js";
import { crossTabSyncFeature } from "../../services/syncService";
import {
  disableAddonsService,
  initAddonsConsoleBridge,
  refreshAddonSecurityPolicies,
} from "../../services/addonsService.js";
import { updateButtonVisibility } from "../components/configButton";
import { createEnabledDisabledToast, createToggleSetting } from "./metaFactory";
import { showFeatureHealthBox } from "../components/featureHealth/index.js";
import { syncHelpMessageFooter } from "../components/helpMessage.js";
import { openConfirmDialog } from "../components/dialog.js";
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
  disableAddonsService: createToggleSetting({
    text: "Disable add-ons service",
    tooltip:
      "Disable the add-ons bridge/API entirely. Running add-ons on this page may keep running until you refresh.",
    config: "globalSettings.disableAddonsService",
    beforeChange: async ({ previousValue, nextValue }) => {
      if (previousValue === true || nextValue !== true) {
        return true;
      }
      return openConfirmDialog({
        title: "Disable add-ons service?",
        description:
          "This disables the add-ons API/bridge. Add-ons already running on this page may need a refresh to fully stop.",
        confirmLabel: "Disable service",
        cancelLabel: "Cancel",
      });
    },
    custom: (value) => {
      if (value) {
        disableAddonsService();
        return;
      }
      initAddonsConsoleBridge();
    },
    toast: (value) =>
      value
        ? "Add-ons service disabled. Refresh the page to fully unload running add-ons."
        : "Add-ons service enabled. Refresh the page to load add-ons.",
  }),
  allowUntrustedAddons: createToggleSetting({
    text: "Allow untrusted add-ons",
    tooltip:
      "Allow unknown add-ons to access addons api. Not recommended unless you know what you're doing",
    config: "globalSettings.allowUntrustedAddons",
    beforeChange: async ({ previousValue, nextValue }) => {
      if (previousValue === true || nextValue !== true) {
        return true;
      }
      return openConfirmDialog({
        title: "Allow untrusted add-ons?",
        description:
          "This enables unknown scripts to access your add-ons API. Only continue if you fully trust the scripts you install.",
        confirmLabel: "I understand, enable",
        cancelLabel: "Cancel",
      });
    },
    custom: () => {
      refreshAddonSecurityPolicies();
    },
    toast: createEnabledDisabledToast("Untrusted add-ons", {
      enabled: "allowed with limited API",
      disabled: "blocked unless trusted",
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
contributeToSection("global", globalSettingsMeta);
