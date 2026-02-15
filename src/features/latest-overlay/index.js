import { createFeature } from "../../core/featureFactory.js";
import {
  enableLatestOverlay,
  disableLatestOverlay,
  reprocessAllTiles,
  resetTile,
  processTile,
} from "./handler.js";

export const latestOverlayFeature = createFeature("Latest Overlay", {
  configPath: "latestSettings.latestOverlayToggle",
  enable: enableLatestOverlay,
  disable: disableLatestOverlay,
});

// Re-export helpers and lifecycle functions for other parts of the app
export { enableLatestOverlay, disableLatestOverlay, reprocessAllTiles, resetTile, processTile };
