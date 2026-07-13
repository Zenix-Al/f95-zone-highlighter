import { createStateManager } from "../core/StateManager.js";
import { pageDefinitions } from "./pageDefinitions.js";
import {
  defaultColors,
  defaultOverlaySettings,
  defaultThreadSetting,
  defaultLatestSettings,
  defaultGlobalSettings,
  defaultAddonsSettings,
  defaultAddonsServiceSettings,
  defaultMetrics,
  defaultPrefixes,
  defaultSavedNotifID,
  defaultTags,
} from "./defaults.js";

export let config = {
  tags: [...defaultTags],
  prefixes: { ...defaultPrefixes, items: [...defaultPrefixes.items], categories: { ...defaultPrefixes.categories } },
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
    service: {
      apiThrottle: { ...defaultAddonsServiceSettings.apiThrottle },
    },
  },
  savedNotifID: defaultSavedNotifID,
};

const runtimeState = {
  shadowRoot: null,
  modalInjected: false,
  settingsUiPrefsLoaded: false,
  settingsActivePanel: "settings-panel-general",
  settingsPinnedAddonIds: [],
  registeredAddons: [],
  tagsUpdateStatus: "IDLE",
  tagsUpdateRan: false,
  ...Object.fromEntries(Object.keys(pageDefinitions).map((key) => [key, false])),
  isCrossTabSyncInitialized: false,
  isNoticeDismissalEnabled: false,
  latestOverlayStatus: "IDLE",
  latestOverlayPageCategory: "games",
};

export const stateManager = createStateManager(runtimeState, {
  warnUnknown: true,
  name: "RuntimeState",
});

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
