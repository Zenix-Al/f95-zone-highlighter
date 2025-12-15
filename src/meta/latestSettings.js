import { toggleWideLatestPage } from "../cores/latest";

// meta/latestSettings.js
export const latestSettingsMeta = {
  autoRefresh: {
    type: "toggle",
    text: "Auto Refresh",
    tooltip: "Auto activate in site auto refresh for the Latest Updates page",
    config: "latestSettings.autoRefresh",
    effects: {
      reapply: "latest",
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
      reapply: "latest",
      toast: (v) => `Min Version set to ${v}`,
    },
  },
  wideLatest: {
    type: "toggle",
    text: "Wide Latest Page",
    tooltip: "Remove width limit on the Latest Updates page",
    config: "latestSettings.wideLatest",
    effects: {
      custom: toggleWideLatestPage,
      toast: (v) => `Wide Latest Page ${v ? "enabled" : "disabled"}`,
    },
  },
};
