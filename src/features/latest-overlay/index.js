import { config } from "../../config.js";
import { createStyledFeature } from "../../core/createStyledFeature.js";
import { debouncedProcessAllTilesReset } from "../../core/tasksRegistry.js";
import { checkOverlaySettings } from "../../services/safetyService.js";
import { saveConfigKeys } from "../../services/settingsService.js";
import { openReorderDialog, openSettingsDialog } from "../../ui/components/dialog.js";
import { showToast } from "../../ui/components/toast.js";
import { createEnabledDisabledToast, createToggleSetting } from "../../ui/settings/metaFactory.js";
import {
  enableLatestOverlay,
  disableLatestOverlay,
  reprocessAllTiles,
  resetTile,
  processTile,
} from "./handler.js";
import { normalizeOverlayColorOrder } from "./overlayOrder.js";
import featureCss from "./style.css";

function runEnableLatestOverlay() {
  enableLatestOverlay();
}

function runDisableLatestOverlay() {
  disableLatestOverlay();
}
export const overlaySettingsMeta = {
  _header_visibility: {
    type: "header",
    text: "Overlay Visibility Settings",
  },
  completed: createToggleSetting({
    text: "Completed",
    tooltip: "Show overlay for completed threads",
    config: "overlaySettings.completed",
    custom: debouncedProcessAllTilesReset,
    toast: createEnabledDisabledToast("Completed"),
  }),
  onhold: createToggleSetting({
    text: "On Hold",
    tooltip: "Show overlay for threads on hold",
    config: "overlaySettings.onhold",
    custom: debouncedProcessAllTilesReset,
    toast: createEnabledDisabledToast("On Hold"),
  }),
  abandoned: createToggleSetting({
    text: "Abandoned",
    tooltip: "Show overlay for abandoned threads",
    config: "overlaySettings.abandoned",
    custom: debouncedProcessAllTilesReset,
    toast: createEnabledDisabledToast("Abandoned"),
  }),
  highVersion: createToggleSetting({
    text: "High Version tag",
    tooltip: "Show overlay for game threads with higher version than your set minimum",
    config: "overlaySettings.highVersion",
    custom: debouncedProcessAllTilesReset,
    toast: createEnabledDisabledToast("High Version"),
  }),
  invalidVersion: createToggleSetting({
    text: "Invalid Version tag",
    tooltip: "Show overlay for threads with invalid version format",
    config: "overlaySettings.invalidVersion",
    custom: debouncedProcessAllTilesReset,
    toast: createEnabledDisabledToast("Invalid Version"),
  }),
  preferred: createToggleSetting({
    text: "Preferred",
    tooltip: "Show overlay for threads you've marked as preferred",
    config: "overlaySettings.preferred",
    custom: debouncedProcessAllTilesReset,
    toast: createEnabledDisabledToast("Preferred"),
  }),
  excluded: createToggleSetting({
    text: "Excluded",
    tooltip: "Show overlay for threads you've marked as excluded",
    config: "overlaySettings.excluded",
    custom: debouncedProcessAllTilesReset,
    toast: createEnabledDisabledToast("Excluded"),
  }),
  overlayText: createToggleSetting({
    text: "Text overlay on tiles",
    tooltip: "Display status text directly over the thread thumbnail",
    config: "overlaySettings.overlayText",
    custom: debouncedProcessAllTilesReset,
    toast: createEnabledDisabledToast("Overlay Text"),
  }),
};
const OVERLAY_KEY_LABELS = {
  excluded: "Excluded",
  preferred: "Preferred",
  completed: "Completed",
  onhold: "On Hold",
  abandoned: "Abandoned",
  highVersion: "High Version",
  invalidVersion: "Invalid Version",
};

async function openOverlayColorOrderEditor() {
  const currentOrder = normalizeOverlayColorOrder(config.latestSettings.latestOverlayColorOrder);
  const items = currentOrder.map((key) => ({ key, label: OVERLAY_KEY_LABELS[key] || key }));

  const result = await openReorderDialog({
    title: "Overlay Color Order",
    description: "Drag or use arrows to set overlay color priority (top = highest priority).",
    items,
    submitLabel: "Save",
    cancelLabel: "Cancel",
  });

  if (result === null) return;

  config.latestSettings.latestOverlayColorOrder = result;
  await saveConfigKeys({ latestSettings: config.latestSettings });
  debouncedProcessAllTilesReset();
  showToast("Overlay color order updated.");
}

const effectOverlayToggle = () => {
  checkOverlaySettings();
  latestOverlayFeature.sync();
};
const latestOverlayToggleSetting = createToggleSetting({
  text: "Enable overlay",
  tooltip: "Show thread status overlay on the Latest Updates page",
  config: "latestSettings.latestOverlayToggle",
  custom: effectOverlayToggle,
  toast: createEnabledDisabledToast("Latest page overlay"),
});

const minVersionSetting = {
  type: "number",
  text: "Minimum version overlay",
  tooltip: "Show overlay if thread version is below this value (e.g., 0.5 = version 0.5)",
  config: "latestSettings.minVersion",
  input: {
    min: 0,
    step: 0.1,
  },
  effects: {
    custom: debouncedProcessAllTilesReset,
    toast: (v) => `Min Version set to ${v}`,
  },
};
const latestOverlayColorOrderSetting = {
  type: "button",
  text: "Overlay color order",
  buttonText: "Edit",
  tooltip: "Choose the stacking order for multi-status overlay colors",
  effects: {
    custom: openOverlayColorOrderEditor,
  },
};
const latestOverlaySettingsDialogMeta = {
  latestOverlayToggle: latestOverlayToggleSetting,
  completed: overlaySettingsMeta.completed,
  onhold: overlaySettingsMeta.onhold,
  abandoned: overlaySettingsMeta.abandoned,
  highVersion: overlaySettingsMeta.highVersion,
  invalidVersion: overlaySettingsMeta.invalidVersion,
  preferred: overlaySettingsMeta.preferred,
  excluded: overlaySettingsMeta.excluded,
  overlayText: overlaySettingsMeta.overlayText,
  minVersion: minVersionSetting,
  latestOverlayColorOrder: latestOverlayColorOrderSetting,
  overlayStyle: {
    type: "select",
    text: "Overlay style",
    tooltip: "Choose how overlay colors are applied to tiles (strip or border)",
    config: "latestSettings.latestOverlayStyle",
    options: [
      { key: "strip", label: "Bottom strip" },
      { key: "border", label: "Colored border" },
    ],
    effects: {
      custom: (v) => {
        debouncedProcessAllTilesReset();
        showToast(`Overlay style saved: ${v}`);
      },
    },
  },
};
function openLatestOverlaySettingsDialog() {
  openSettingsDialog({
    title: "Latest Overlay Settings",
    description: "Configure overlay toggle, labels, filters, and color order.",
    metaMap: latestOverlaySettingsDialogMeta,
  });
}
export const latestOverlayFeature = createStyledFeature("Latest Overlay", {
  configPath: "latestSettings.latestOverlayToggle",
  isApplicable: ({ stateManager }) => stateManager.get("isLatest"),
  styleCss: featureCss,
  enable: runEnableLatestOverlay,
  disable: runDisableLatestOverlay,
  settingsUi: {
    id: "latest-overlay",
    sectionId: "latest",
    metaMaps: [
      {
        latestOverlaySettings: {
          type: "button",
          text: "Latest overlay settings",
          buttonText: "Open",
          tooltip: "Open latest-page overlay configuration",
          effects: {
            custom: openLatestOverlaySettingsDialog,
          },
        },
      },
    ],
  },
});

// Re-export helpers and lifecycle functions for other parts of the app
export { reprocessAllTiles, resetTile, processTile };
