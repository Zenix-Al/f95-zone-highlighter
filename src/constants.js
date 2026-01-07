export const debug = false;
export const state = {
  modalInjected: false,
  tagsUpdated: false,
  globalSettingsRendered: false,
  colorRendered: false,
  overlayRendered: false,
  threadSettingsRendered: false,
  isThread: false,
  isLatest: false,
  isImgRetryInjected: false,
  firstLoad: true,
  isMaskedLink: false,
  isMaskedLinkApplied: false,
  isProcessingTiles: false,
  isCrossTabSyncInitialized: false,
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
};

export const defaultThreadSetting = {
  neutral: true,
  preferred: true,
  preferredShadow: true,
  excluded: true,
  excludedShadow: true,
  isWide: false,
  imgRetry: false,
  skipMaskedLink: true,
  collapseSignature: false,
  threadOverlayToggle: true,
};

export const defaultLatestSettings = {
  autoRefresh: false,
  webNotif: false,
  minVersion: 0.5,
  wideLatest: false,
  denseLatestGrid: false,
  latestOverlayToggle: true,

  // ── new horny addition ──
  goldenFreshGlow: true, // main toggle
  goldenMaxViews: 5000, // threshold
  goldenMaxAgeMinutes: 60, // strict <1h or relax to 120/180 later
  goldenMaxBleedPx: 6, // keep it tight
  goldenMinOpacity: 0.15, // so it never fully disappears
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
export const defaultGlobalSettings = {
  configVisibility: true,
  enableCrossTabSync: false,
};
export const config = {
  tags: [],
  preferredTags: [],
  excludedTags: [],
  color: [],
  overlaySettings: [],
  threadSettings: [],
  globalSettings: [],
  configVisibility: true,
  minVersion: 0.5,
  latestSettings: [],
  metrics: metrics,
};

export const STATUS = Object.freeze({
  PREFERRED: "preferred",
  EXCLUDED: "excluded",
  NEUTRAL: "neutral",
  PREFFERED_SHADOW: "preffered-shadow",
  EXCLUDED_SHADOW: "excluded-shadow",
});

export const crossTabKeys = {
  color: true,
  overlaySettings: true,
  threadSettings: true,
  latestSettings: true,
};
