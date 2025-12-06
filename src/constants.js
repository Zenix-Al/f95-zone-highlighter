export const debug = false;
export const state = {
  modalInjected: false,
  tagsUpdated: false,
  colorRendered: false,
  overlayRendered: false,
  threadSettingsRendered: false,
  reapplyOverlay: false,
  refreshNotification: false,
  refreshThread: false,
  isThread: false,
  isLatest: false,
  isImgRetryInjected: false,
  firstLoad: true,
};
export const validVersions = ["full", "final"];

export const defaultColors = {
  completed: "#388e3c",
  onhold: "#1976d2",
  abandoned: "#c9a300",
  highVersion: "#2e7d32",
  invalidVersion: "#a38400",
  tileInfo: "#9398a0",
  tileHeader: "#d9d9d9",
  preferred: "#7b1fa2",
  preferredText: "#ffffff",
  excluded: "#b71c1c",
  excludedText: "#ffffff",
  neutral: "#37383a",
  neutralText: "#9398a0",
};
export const defaultOverlaySettings = {
  completed: true,
  onhold: true,
  abandoned: true,
  highVersion: true,
  invalidVersion: true,
  preferred: true,
  excluded: true,
  overlayText: true,
  tileText: true,
};
export const overlaySettingsText = {
  completed: "Completed",
  onhold: "On Hold",
  abandoned: "Abandoned",
  highVersion: "High Version tag",
  invalidVersion: "Invalid Version tag",
  preferred: "Preferred",
  excluded: "Excluded",
  overlayText: "Text overlay on tiles",
  tileText: "Show status text on tiles",
};

export const overlaySettingsTooltip = {
  completed: "Show overlay for completed threads",
  onhold: "Show overlay for threads on hold",
  abandoned: "Show overlay for abandoned threads",
  highVersion: "Show overlay for game threads with higher version than your set minimum",
  invalidVersion: "Show overlay for threads with invalid version format",
  preferred: "Show overlay for threads you've marked as preferred",
  excluded: "Show overlay for threads you've marked as excluded",
  overlayText: "Display status text directly over the thread thumbnail",
  tileText: "Show status labels on thread tiles (corner badges, etc.)", //TODO : this option should make the text more clear
};
export const defaultThreadSetting = {
  neutral: true,
  preferred: true,
  preferredShadow: true,
  excluded: true,
  excludedShadow: true,
  isWide: false,
  imgRetry: false,
};
export const threadSettingsText = {
  neutral: "Show Neutral overlay",
  preferred: "Show Preferred overlay",
  preferredShadow: "Preferred overlay shadow",
  excluded: "Show Excluded overlay",
  excludedShadow: "Show excluded overlay shadow",
  isWide: "Wide thread (full width)",
  imgRetry: "Image Retry",
};
export const threadSettingsTooltip = {
  neutral: "Display neutral reaction buttons",
  preferred: "Display your preferred (favorited) overlay",
  preferredShadow: "Add a subtle shadow effect to preferred overlay",
  excluded: "Show overlay you've excluded",
  excludedShadow: "Add shadow to excluded overlay",
  isWide: "Remove max-width restriction — makes thread use full screen width",
  imgRetry: "Enable image retry for broken images in threads",
};
export const defaultLatestSettings = {
  autoRefresh: false,
  webNotif: false,
  minVersion: 0.5,
  //scriptNotif: false,
};
export const latestSettingsText = {
  autoRefresh: "Auto Refresh",
  webNotif: "Web Notifications",
  minVersion: "Minimum version overlay",
};

export const latestSettingsTooltip = {
  autoRefresh: "Auto activate in site auto refresh for the Latest Updates page",
  webNotif:
    "Auto activate in site web notifications for new threads (site might ask for permission)",
  minVersion: "Show overay if thread version is below this value (e.g., 0.5 = version 0.5 )",
};
export const metrics = {
  retried: 0,
  succeeded: 0,
  failed: 0,
  avgCache: 0,
  highest: 0,
  lowest: Infinity,
  mean: 0,
};
export const config = {
  tags: [],
  preferredTags: [],
  excludedTags: [],
  color: [],
  overlaySettings: [],
  threadSettings: [],
  configVisibility: true,
  minVersion: 0.5,
  latestSettings: [],
  metrics: metrics,
};

export const STATUS = Object.freeze({
  PREFERRED: "preferred",
  EXCLUDED: "excluded",
  NEUTRAL: "neutral",
});

export const overlaySettingsMeta = {
  completed: {
    text: "Completed",
    tooltip: "Show overlay for completed threads",
    type: "toggle",
  },
  onhold: {
    text: "On Hold",
    tooltip: "Show overlay for threads on hold",
    type: "toggle",
  },
  abandoned: {
    text: "Abandoned",
    tooltip: "Show overlay for abandoned threads",
    type: "toggle",
  },
  highVersion: {
    text: "High Version tag",
    tooltip: "Show overlay for game threads with higher version than your set minimum",
    type: "toggle",
  },
  invalidVersion: {
    text: "Invalid Version tag",
    tooltip: "Show overlay for threads with invalid version format",
    type: "toggle",
  },
  preferred: {
    text: "Preferred",
    tooltip: "Show overlay for threads you've marked as preferred",
    type: "toggle",
  },
  excluded: {
    text: "Excluded",
    tooltip: "Show overlay for threads you've marked as excluded",
    type: "toggle",
  },
  overlayText: {
    text: "Text overlay on tiles",
    tooltip: "Display status text directly over the thread thumbnail",
    type: "toggle",
  },
  tileText: {
    text: "Show status text on tiles",
    tooltip: "Show status labels on thread tiles (corner badges, etc.)",
    type: "toggle",
  },
};

export const threadSettingsMeta = {
  neutral: {
    text: "Show Neutral overlay",
    tooltip: "Display neutral reaction buttons",
    type: "toggle",
  },
  preferred: {
    text: "Show Preferred overlay",
    tooltip: "Display your preferred (favorited) overlay",
    type: "toggle",
  },
  preferredShadow: {
    text: "Preferred overlay shadow",
    tooltip: "Add a subtle shadow effect to preferred overlay",
    type: "toggle",
  },
  excluded: {
    text: "Show Excluded overlay",
    tooltip: "Show overlay you've excluded",
    type: "toggle",
  },
  excludedShadow: {
    text: "Show excluded overlay shadow",
    tooltip: "Add shadow to excluded overlay",
    type: "toggle",
  },
  isWide: {
    text: "Wide thread (full width)",
    tooltip: "Remove max-width restriction — makes thread use full screen width",
    type: "toggle",
  },
  imgRetry: {
    text: "Image Retry",
    tooltip: "Enable image retry for broken images in threads",
    type: "toggle",
  },
};

export const latestSettingsMeta = {
  autoRefresh: {
    text: "Auto Refresh",
    tooltip: "Auto activate in site auto refresh for the Latest Updates page",
    type: "toggle",
  },
  webNotif: {
    text: "Web Notifications",
    tooltip:
      "Auto activate in site web notifications for new threads (site might ask for permission)",
    type: "toggle",
  },
  minVersion: {
    text: "Minimum version overlay",
    tooltip: "Show overay if thread version is below this value (e.g., 0.5 = version 0.5 )",
    type: "number",
  },
};
