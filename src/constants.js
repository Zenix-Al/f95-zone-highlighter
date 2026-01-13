export const debug = true;
export const state = {
  modalInjected: false,
  tagsUpdated: false,
  globalSettingsRendered: false,
  colorRendered: false,
  overlayRendered: false,
  threadSettingsRendered: false,
  isThread: false,
  isLatest: false,
  isDownloadPage: false,
  isDirectDownloadPage: false,
  isImgRetryInjected: false,
  isF95Zone: false,
  firstLoad: true,
  isMaskedLink: false,
  isMaskedLinkApplied: false,
  isProcessingTiles: false,
  isCrossTabSyncInitialized: false,
  isDirectDownloadHijackApplied: false,
  isDirectDownloadmsgHandlerApplied: false,
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
  directDownloadLinks: true,
};

export const defaultLatestSettings = {
  autoRefresh: false,
  webNotif: false,
  minVersion: 0.5,
  wideLatest: false,
  denseLatestGrid: false,
  latestOverlayToggle: true,
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
  closeNotifOnClick: true,
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
  savedNotifID: null,
  processingDownload: false,
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

export const supportedHosts = [
  "buzzheavier.com",
  //"pixeldrain.com", // disabled because not working
  "gofile.io",
  //'mega.nz',
  //'anonfiles.com',
];
export const typeDownload = [
  {
    id: "buzzheavier.com",
    type: "iframe",
  },
  {
    id: "gofile.io",
    type: "normal",
  },
];
export const supportedDirectDownload = [
  {
    id: "buzzheavier.com",
    host: "trashbytes.net",
    pathStartsWith: "/dl/",
    btn: 'a[hx-get*="/download"]',
    directDownloadLink: /https:\/\/trashbytes\.net\/dl\/[\w-]+(?:\?.+)?/,
  },
  {
    id: "gofile.io",
    host: "gofile.io",
  },
  // disabled because not working
  //{
  //  id: "pixeldrain.com",
  //  host: "pixeldrain.com",
  //  pathStartsWith: "/f/",
  //  btn: 'a[href*="/d/"]',
  //  directDownloadLink: /https:\/\/pixeldrain\.com\/d\/[\w-]+(?:\?.+)?/,
  //},
  //other hosts can be added here
];
export const cache = new Map();
export const colorState = {
  PENDING: { color: "#FFA500" },
  SUCCESS: { color: "#4CAF50" },
  FAILED: { color: "#F44336" },
};
export const timeoutMS = 8000;
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
  //actual helpful one
  "hover over options text to see detailed settings",
  "overlay colors can be customized in the color settings section",
  "direct download links are available in thread view for supported hosts",
  "not all links are masked",
  "enable cross-tab sync to keep settings consistent across tabs(experimental)",
  "auto-refresh in latest view is just clicking the website own feature",
  "latest notification require auto-refresh enabled",
  "you can add tags to preferred/excluded as much as you want",
];
