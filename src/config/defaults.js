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
  marked: "#4a4f55",
  markedText: "#ffffff",
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
  ratingHighlight: true,
  engagementHighlight: true,
};

export const defaultThreadSetting = {
  marked: true,
  preferred: true,
  preferredShadow: true,
  excluded: true,
  excludedShadow: true,
  isWide: false,
  collapseSignature: false,
  threadOverlayToggle: true,
};

export const defaultPriorityWeights = {
  rating: 2.5,
  engagement: 1.5,
  tags: 6.0,
};

export const defaultTagModifiers = {
  preferred: 0.25,
  completed: 0.25,
  highVersion: 0.12,
  onhold: -0.2,
  abandoned: -0.4,
  excluded: -0.55,
  invalidVersion: 0.22,
};

export const defaultLatestSettings = {
  autoRefresh: false,
  webNotif: false,
  minVersion: 0.5,
  wideLatest: false,
  denseLatestGrid: false,
  latestOverlayToggle: true,
  latestOverlayColorOrder: [
    "excluded",
    "preferred",
    "completed",
    "onhold",
    "abandoned",
    "highVersion",
    "invalidVersion",
  ],
  latestOverlayStyle: "strip",
  ratingHighlightThreshold: 3,
  engagementRatioThreshold: 50,
  enableScoreWeights: true,
  priorityWeights: { ...defaultPriorityWeights },
  tagModifiers: { ...defaultTagModifiers },
};

export const defaultGlobalSettings = {
  configVisibility: true,
  closeNotifOnClick: true,
  allowUntrustedAddons: false,
  disableAddonsService: false,
};

export const defaultAddonsApiThrottleSettings = {
  coreActionWindowMs: 5000,
  coreActionRateMax: 100,
  coreActionMaxConcurrent: 12,
};

export const defaultAddonsServiceSettings = {
  apiThrottle: { ...defaultAddonsApiThrottleSettings },
};

export const defaultAddonsSettings = {
  trustedIds: ["site-repair-addon", "masked-direct-addon", "example-addon"],
  byAddon: {},
  installedMeta: {},
  service: {
    apiThrottle: { ...defaultAddonsApiThrottleSettings },
  },
};

// Persisted baseline values belong here; schema.js supplies constraints and metadata.
export const defaultTags = [];
export const defaultPrefixes = { items: [], categories: {} };
export const defaultSavedNotifID = null;
