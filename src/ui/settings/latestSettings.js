import { config, state } from "../../config";
import { toggleWideLatestPage } from "../../features/wide-latest/wide-latest-page.js";
import { toggleDenseLatestGrid } from "../../features/wide-latest/dense-latest-page.js";
import { toggleLatestControls } from "../../features/latest-control/latest-controls.js";
import { checkOverlaySettings } from "../../services/safetyService";
import { debouncedProcessAllTilesReset, debouncedUpdateLatestUI } from "../../core/tasksRegistry";
import {
  enableLatestOverlay,
  disableLatestOverlay,
} from "../../features/latest-overlay/latest-overlay.js";

const effectOverlayToggle = () => {
  checkOverlaySettings();
  debouncedUpdateLatestUI();
  if (!state.isLatest) return;
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
        state.isLatest && toggleLatestControls();
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
        state.isLatest && toggleLatestControls();
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
        state.isLatest && toggleWideLatestPage();
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
        state.isLatest && toggleDenseLatestGrid();
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
};
