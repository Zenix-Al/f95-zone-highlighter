import { config, state } from "../../constants";
import { handleWebClick, toggleDenseLatestGrid, toggleWideLatestPage } from "../../core/latest";
import { checkOverlaySettings } from "../../core/safety";
import {
  queuedProcessAllTilesReset,
  queuedResetAllTiles,
  queuedUpdateLatestUI,
} from "../../core/tasksRegistry";

const effectOverlayToggle = () => {
  checkOverlaySettings();
  queuedUpdateLatestUI();
  if (!state.isLatest) return;
  if (!config.latestSettings.latestOverlayToggle) {
    queuedResetAllTiles();
  } else {
    queuedProcessAllTilesReset();
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
        state.isLatest && handleWebClick();
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
        state.isLatest && handleWebClick();
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
      custom: queuedProcessAllTilesReset,
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
