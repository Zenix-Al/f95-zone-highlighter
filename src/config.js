import createStateManager from "./core/StateManager.js";
import TIMINGS from "./config/timings.js";

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
};

export const defaultGlobalSettings = {
  configVisibility: true,
  closeNotifOnClick: true,
  enableCrossTabSync: false,
  allowUntrustedAddons: false,
};

export const defaultAddonsSettings = {
  trustedIds: ["image-repair-addon", "masked-direct-addon"],
  byAddon: {},
  installedMeta: {},
};

export const defaultMetrics = {
  retried: 0,
  succeeded: 0,
  failed: 0,
  avgCache: 0,
  highest: 0,
  lowest: Infinity,
  mean: 0,
};

// This object holds all user-configurable settings that are persisted.
// It is initialized with default values and can be updated from storage.
export let config = {
  tags: [],
  preferredTags: [],
  excludedTags: [],
  markedTags: [],
  color: { ...defaultColors },
  overlaySettings: { ...defaultOverlaySettings },
  threadSettings: { ...defaultThreadSetting },
  globalSettings: { ...defaultGlobalSettings },
  latestSettings: { ...defaultLatestSettings },
  metrics: { ...defaultMetrics },
  addons: {
    trustedIds: [...defaultAddonsSettings.trustedIds],
    byAddon: { ...defaultAddonsSettings.byAddon },
    installedMeta: { ...defaultAddonsSettings.installedMeta },
  },
  savedNotifID: null,
};

// This object holds the script's temporary, in-memory state.
// It resets on every page load.
// tagsUpdateStatus values: "IDLE", "UPDATING", "COMPLETE".
// latestOverlayStatus values: "IDLE", "INITIALIZING", "ACTIVE", "TEARING_DOWN".
const runtimeState = {
  shadowRoot: null,
  modalInjected: false,
  settingsUiPrefsLoaded: false,
  settingsActivePanel: "settings-panel-general",
  settingsPinnedAddonIds: [],
  registeredAddons: [],
  tagsUpdateStatus: "IDLE",
  globalSettingsRendered: false,
  colorRendered: false,
  overlayRendered: false,
  threadSettingsRendered: false,
  tagsUpdateRan: false,
  isThread: false,
  isLatest: false,
  isDownloadPage: false,
  isF95Zone: false,
  firstLoad: true,
  isMaskedLink: false,
  isMaskedLinkApplied: false,
  isProcessingTiles: false,
  isCrossTabSyncInitialized: false,
  isMsgEventHandlerApplied: false,
  isNoticeDismissalEnabled: false,
  isRecaptchaFrame: false,
  latestOverlayStatus: "IDLE",
};

const stateManager = createStateManager(runtimeState, {
  warnUnknown: true,
  name: "RuntimeState",
});
export default stateManager;

export const STATUS = Object.freeze({
  PREFERRED: "preferred",
  EXCLUDED: "excluded",
  MARKED: "marked",
  PREFERRED_SHADOW: "preferred-shadow",
  EXCLUDED_SHADOW: "excluded-shadow",
});

export const crossTabKeys = {
  color: true,
  overlaySettings: true,
  threadSettings: true,
  latestSettings: true,
  addons: true,
};

export const cache = new Map();
export const colorState = {
  PENDING: { color: "#FFA500" },
  SUCCESS: { color: "#4CAF50" },
  FAILED: { color: "#F44336" },
};
export const timeoutMS = TIMINGS.DOWNLOAD_TIMEOUT;
// Contains jokes plus practical usage hints.
export const helpMessages = [
  "type /help if you're lost, or just moan really loud",
  "pro tip: don't nut before reading this",
  "i like futa. there, i said it. your turn",
  "this script runs on pure hornyposting energy",
  "close this modal or i'm gonna start describing my strap game",
  "404: chill not found",
  "if you're reading this you're already too deep",
  "send feet pics to continue",
  "bro just edge to the config screen like a normal person",
  "my safe word is 'more'",
  "tag your mom in the next notification",
  "error 69: too much horni detected",
  "i'm not saying step on me but… step on me",
  "this message will self-destruct after you cum",
  "futa supremacy 2026",
  "why are you still reading? go touch grass… or yourself",
  "config so clean it deserves to get railed",
  "what's that boring vanilla tags?",
  "you need more futa in your life",
  "if you can read this, you're not horny enough",
  "stay hydrated, stay horny",
  "hover over options text to see detailed settings",
  "overlay colors can be customized in the color settings section",
  "not all links are masked",
  "enable cross-tab sync to keep settings consistent across tabs(experimental)",
  "auto-refresh in latest view is just clicking the website own feature",
  "latest notification require auto-refresh enabled",
  "you can add tags to preferred/excluded as much as you want",
  "preferred/excluded tag chips can be reordered by dragging them",
];
