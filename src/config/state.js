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
