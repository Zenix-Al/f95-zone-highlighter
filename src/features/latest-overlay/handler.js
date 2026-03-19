import stateManager, { config } from "../../config.js";
import { debugLog } from "../../core/logger";
import { addObserverCallback, removeObserverCallback } from "../../core/observer";
import { refreshCaches } from "./overlayCache.js";
import {
  incrementGeneration,
  clearMutationState,
  processMutations,
  hasTileMutations,
  processAllTiles,
  reprocessAllTiles,
  resetAllTiles,
  resetTile,
  processTile,
} from "./tilePatcher.js";
import { setupHoverListener, teardownHoverListener } from "./hoverTagHandler.js";

export { reprocessAllTiles, resetTile, processTile, processAllTiles };

export function enableLatestOverlay() {
  if (
    stateManager.get("latestOverlayStatus") !== "IDLE" ||
    !config.latestSettings.latestOverlayToggle ||
    !stateManager.get("isLatest")
  ) {
    return;
  }

  debugLog("Latest Overlay", "Initializing feature...");
  stateManager.set("latestOverlayStatus", "INITIALIZING");

  const currentGeneration = incrementGeneration();
  refreshCaches();

  processAllTiles(false, currentGeneration);
  addObserverCallback(
    "latest-overlay",
    (mutationsList) => processMutations(mutationsList, currentGeneration),
    { filter: hasTileMutations },
  );

  setupHoverListener();
  stateManager.set("latestOverlayStatus", "ACTIVE");
  debugLog("Latest Overlay", "Feature is now ACTIVE.");
}

export function disableLatestOverlay() {
  if (
    stateManager.get("latestOverlayStatus") === "IDLE" ||
    stateManager.get("latestOverlayStatus") === "TEARING_DOWN"
  ) {
    debugLog(
      "Latest Overlay",
      `Disable called but feature is already in state: ${stateManager.get("latestOverlayStatus")}. Aborting.`,
    );
    return;
  }

  debugLog("Latest Overlay", "Disabling feature...");
  stateManager.set("latestOverlayStatus", "TEARING_DOWN");

  incrementGeneration();
  clearMutationState();
  teardownHoverListener();

  removeObserverCallback("latest-overlay");
  debugLog("Latest Overlay", "Observer callback for 'latest-overlay' removed.");

  resetAllTiles();

  stateManager.set("latestOverlayStatus", "IDLE");
  debugLog("Latest Overlay", "Disable complete. State is now IDLE.");
}
