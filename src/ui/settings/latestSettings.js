import stateManager, { config } from "../../config.js";
import { wideLatestPageFeature, denseLatestGridFeature } from "../../features/wide-latest/index.js";
import { latestControlFeature } from "../../features/latest-control/index.js";
import { checkOverlaySettings } from "../../services/safetyService";
import { debouncedProcessAllTilesReset } from "../../core/tasksRegistry";
import { latestOverlayFeature } from "../../features/latest-overlay/index.js";
import { saveConfigKeys } from "../../services/settingsService";
import { showToast } from "../components/toast";
import {
  OVERLAY_COLOR_ORDER_KEYS,
  normalizeOverlayColorOrder,
} from "../../features/latest-overlay/overlayOrder.js";
import { openSettingsDialog, openTextPrompt } from "../components/dialog.js";
import { overlaySettingsMeta } from "./overlaySettings.js";
import { createEnabledDisabledToast, createToggleSetting } from "./metaFactory";

async function openOverlayColorOrderEditor() {
  const currentOrder = normalizeOverlayColorOrder(config.latestSettings.latestOverlayColorOrder);
  const input = await openTextPrompt({
    title: "Overlay Color Order",
    description: [
      "Set overlay color order (comma-separated keys).",
      `Allowed: ${OVERLAY_COLOR_ORDER_KEYS.join(", ")}`,
      `Current: ${currentOrder.join(", ")}`,
    ].join(" "),
    defaultValue: currentOrder.join(", "),
    placeholder: "excluded, preferred, completed, onhold, abandoned, highVersion, invalidVersion",
    submitLabel: "Save",
    cancelLabel: "Cancel",
  });

  if (input === null) return;

  const parsed = input
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const isValid =
    parsed.length === OVERLAY_COLOR_ORDER_KEYS.length &&
    new Set(parsed).size === OVERLAY_COLOR_ORDER_KEYS.length &&
    parsed.every((key) => OVERLAY_COLOR_ORDER_KEYS.includes(key));

  if (!isValid) {
    showToast("Invalid order. Use each allowed key exactly once.");
    return;
  }

  config.latestSettings.latestOverlayColorOrder = parsed;
  await saveConfigKeys({ latestSettings: config.latestSettings });
  debouncedProcessAllTilesReset();
  showToast("Overlay color order updated.");
}

const effectOverlayToggle = () => {
  checkOverlaySettings();
  if (!stateManager.get("isLatest")) return;
  if (!config.latestSettings.latestOverlayToggle) {
    latestOverlayFeature.disable();
  } else {
    latestOverlayFeature.enable();
  }
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
};

function openLatestOverlaySettingsDialog() {
  openSettingsDialog({
    title: "Latest Overlay Settings",
    description: "Configure overlay toggle, labels, filters, and color order.",
    metaMap: latestOverlaySettingsDialogMeta,
  });
}

export const latestSettingsMeta = {
  autoRefresh: createToggleSetting({
    text: "Auto Refresh",
    tooltip: "Auto activate in site auto refresh for the Latest Updates page",
    config: "latestSettings.autoRefresh",
    custom: () => {
      stateManager.get("isLatest") && latestControlFeature.enable();
    },
    toast: createEnabledDisabledToast("Auto Refresh"),
  }),
  webNotif: createToggleSetting({
    text: "Web Notifications",
    tooltip:
      "Auto activate in site web notifications for new threads (site might ask for permission)",
    config: "latestSettings.webNotif",
    custom: () => {
      stateManager.get("isLatest") && latestControlFeature.enable();
    },
    toast: createEnabledDisabledToast("Web Notifications"),
  }),
  wideLatest: createToggleSetting({
    text: "Wide Latest Page",
    tooltip: "Remove width limit on the Latest Updates page",
    config: "latestSettings.wideLatest",
    custom: () => {
      stateManager.get("isLatest") && wideLatestPageFeature.toggle(config.latestSettings.wideLatest);
    },
    toast: createEnabledDisabledToast("Wide Latest Page"),
  }),
  denseLatestGrid: createToggleSetting({
    text: "Dense Latest Grid",
    tooltip: "Reduce spacing between thread tiles on the Latest Updates page",
    config: "latestSettings.denseLatestGrid",
    custom: () => {
      stateManager.get("isLatest") &&
        denseLatestGridFeature.toggle(config.latestSettings.denseLatestGrid);
    },
    toast: createEnabledDisabledToast("Dense Latest Grid"),
  }),
  latestOverlaySettings: {
    type: "button",
    text: "Latest overlay settings",
    buttonText: "Open",
    tooltip: "Open latest-page overlay configuration",
    effects: {
      custom: openLatestOverlaySettingsDialog,
    },
  },
};
