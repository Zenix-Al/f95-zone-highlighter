import stateManager, { config } from "../../config.js";
import { wideLatestPageFeature, denseLatestGridFeature } from "../../features/wide-latest/index.js";
import { latestControlFeature } from "../../features/latest-control/index.js";
import { checkOverlaySettings } from "../../services/safetyService";
import { debouncedProcessAllTilesReset, debouncedUpdateLatestUI } from "../../core/tasksRegistry";
import { enableLatestOverlay, disableLatestOverlay } from "../../features/latest-overlay/index.js";
import { saveConfigKeys } from "../../services/settingsService";
import { showToast } from "../components/toast";
import {
  OVERLAY_COLOR_ORDER_KEYS,
  normalizeOverlayColorOrder,
} from "../../features/latest-overlay/overlayOrder.js";
import { openTextPrompt } from "../components/dialog.js";

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
  debouncedUpdateLatestUI();
  if (!stateManager.get("isLatest")) return;
  if (!config.latestSettings.latestOverlayToggle) {
    // When turning OFF, we call the function that handles full teardown and cleanup.
    disableLatestOverlay();
  } else {
    // When turning ON, we must call enableLatestOverlay to initialize the task queue and observer.
    // Calling a "reprocess" task would fail because the queue would be null.
    enableLatestOverlay();
  }
};

export const latestSettingsMeta = {
  autoRefresh: {
    type: "toggle",
    text: "Auto Refresh",
    tooltip: "Auto activate in site auto refresh for the Latest Updates page",
    config: "latestSettings.autoRefresh",
    effects: {
      custom: () => {
        stateManager.get("isLatest") && latestControlFeature.enable();
      },
      toast: (v) => `Auto Refresh ${v ? "enabled" : "disabled"}`,
    },
  },
  webNotif: {
    type: "toggle",
    text: "Web Notifications",
    tooltip:
      "Auto activate in site web notifications for new threads (site might ask for permission)",
    config: "latestSettings.webNotif",
    effects: {
      custom: () => {
        stateManager.get("isLatest") && latestControlFeature.enable();
      },
      toast: (v) => `Web Notifications ${v ? "enabled" : "disabled"}`,
    },
  },
  minVersion: {
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
  },
  wideLatest: {
    type: "toggle",
    text: "Wide Latest Page",
    tooltip: "Remove width limit on the Latest Updates page",
    config: "latestSettings.wideLatest",
    effects: {
      custom: () => {
        stateManager.get("isLatest") &&
          wideLatestPageFeature.toggle(config.latestSettings.wideLatest);
      },
      toast: (v) => `Wide Latest Page ${v ? "enabled" : "disabled"}`,
    },
  },
  denseLatestGrid: {
    type: "toggle",
    text: "Dense Latest Grid",
    tooltip: "Reduce spacing between thread tiles on the Latest Updates page",
    config: "latestSettings.denseLatestGrid",
    effects: {
      custom: () => {
        stateManager.get("isLatest") &&
          denseLatestGridFeature.toggle(config.latestSettings.denseLatestGrid);
      },
      toast: (v) => `Dense Latest Grid ${v ? "enabled" : "disabled"}`,
    },
  },
  latestOverlayToggle: {
    type: "toggle",
    text: "Enable overlay",
    tooltip: "Show thread status overlay on the Latest Updates page",
    config: "latestSettings.latestOverlayToggle",
    effects: {
      custom: effectOverlayToggle,
      toast: (v) => `Latest page overlay ${v ? "enabled" : "disabled"}`,
    },
  },
  latestOverlayColorOrder: {
    type: "button",
    text: "Overlay color order",
    buttonText: "Edit",
    tooltip:
      "Choose the stacking order for multi-status overlay colors. Opens comma-list editor.",
    effects: {
      custom: openOverlayColorOrderEditor,
    },
  },
};
