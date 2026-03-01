import { createStyledFeature } from "../../core/createStyledFeature.js";
import {
  enableLatestOverlay as enableLatestOverlayCore,
  disableLatestOverlay as disableLatestOverlayCore,
  reprocessAllTiles,
  resetTile,
  processTile,
} from "./handler.js";
import featureCss from "./style.css";

function runEnableLatestOverlay() {
  enableLatestOverlayCore();
}

function runDisableLatestOverlay() {
  disableLatestOverlayCore();
}

export const latestOverlayFeature = createStyledFeature("Latest Overlay", {
  configPath: "latestSettings.latestOverlayToggle",
  styleCss: featureCss,
  enable: runEnableLatestOverlay,
  disable: runDisableLatestOverlay,
});

// Re-export helpers and lifecycle functions for other parts of the app
export { reprocessAllTiles, resetTile, processTile };
