import { createFeature } from "../../core/featureFactory.js";
import {
  enableLatestOverlay as enableLatestOverlayCore,
  disableLatestOverlay as disableLatestOverlayCore,
  reprocessAllTiles,
  resetTile,
  processTile,
} from "./handler.js";
import featureCss from "./style.css";
import { acquireStyle, removeStyle } from "../../core/styleRegistry.js";

const LATEST_OVERLAY_STYLE_ID = "feature-latest-overlay";

export function enableLatestOverlay() {
  acquireStyle(LATEST_OVERLAY_STYLE_ID, featureCss, "document");
  enableLatestOverlayCore();
}

export function disableLatestOverlay() {
  disableLatestOverlayCore();
  removeStyle(LATEST_OVERLAY_STYLE_ID);
}

export const latestOverlayFeature = createFeature("Latest Overlay", {
  configPath: "latestSettings.latestOverlayToggle",
  enable: enableLatestOverlay,
  disable: disableLatestOverlay,
});

// Re-export helpers and lifecycle functions for other parts of the app
export { reprocessAllTiles, resetTile, processTile };
