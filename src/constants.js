export const debug = false;
export const state = {
  modalInjected: false,
  tagsUpdated: false,
  colorRendered: false,
  overlayRendered: false,
  threadSettingsRendered: false,
  reapplyOverlay: false,
  isThread: false,
  isLatest: false,
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
export const defaultThreadSetting = {
  neutral: true,
  preferred: true,
  preferredShadow: true,
  excluded: true,
  excludedShadow: true,
  imgRetry: false,
};
export const defaultLatestSettings = {
  autoRefresh: false,
  webNotif: false,
  scriptNotif: false,
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
