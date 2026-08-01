import { createStyledFeature } from "../../core/createStyledFeature.js";
import {
  disableLatestOverlay,
  enableLatestOverlay,
  processTile,
  reprocessAllTiles,
  resetTile,
} from "./handler.js";
import { initializeLatestOverlaySettings } from "./settings.js";
import featureCss from "./style.css";

const settingsUi = initializeLatestOverlaySettings({
  syncFeature: () => latestOverlayFeature.sync(),
});

export const latestOverlayFeature = createStyledFeature("Latest Overlay", {
  id: "latest-raw-capture",
  configPath: "latestSettings.latestOverlayToggle",
  pageScopes: ["isLatest"],
  isApplicable: ({ stateManager }) => stateManager.get("isLatest"),
  bootstrapMode: "fast",
  styleCss: featureCss,
  enable: enableLatestOverlay,
  disable: disableLatestOverlay,
  settingsUi,
});

export { processTile, reprocessAllTiles, resetTile };
export {
  engagementWeightSetting,
  modifierAbandonedSetting,
  modifierCompletedSetting,
  modifierExcludedSetting,
  modifierHighVersionSetting,
  modifierInvalidVersionSetting,
  modifierOnholdSetting,
  modifierPreferredSetting,
  overlaySettingsMeta,
  overlayStyleSetting,
  ratingWeightSetting,
  resetLatestOverlaySettingsButton,
  tagWeightSetting,
} from "./settings.js";
