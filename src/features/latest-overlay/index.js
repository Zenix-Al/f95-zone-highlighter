import { createStyledFeature } from "../../core/createStyledFeature.js";
import {
  enableLatestOverlay,
  disableLatestOverlay,
  reprocessAllTiles,
  resetTile,
  processTile,
} from "./handler.js";
import featureCss from "./style.css";

function runEnableLatestOverlay() {
  enableLatestOverlay();
}

function runDisableLatestOverlay() {
  disableLatestOverlay();
}

export const latestOverlayFeature = createStyledFeature("Latest Overlay", {
  configPath: "latestSettings.latestOverlayToggle",
  isApplicable: ({ stateManager }) => stateManager.get("isLatest"),
  styleCss: featureCss,
  enable: runEnableLatestOverlay,
  disable: runDisableLatestOverlay,
});

// Re-export helpers and lifecycle functions for other parts of the app
export { reprocessAllTiles, resetTile, processTile };
