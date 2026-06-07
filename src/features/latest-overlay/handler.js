import { stateManager } from "../../config.js";
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

const DEFAULT_LATEST_OVERLAY_CATEGORY = "games";
const KNOWN_LATEST_OVERLAY_CATEGORIES = new Set([
  "games",
  "comics",
  "animations",
  "assets",
  "mods",
]);
let latestOverlayLastHash = String(window.location?.hash || "");

function getCategoryFromLatestHash() {
  const hash = String(window.location?.hash || "");
  const match = hash.match(/(?:^|[\/#&])cat=([^\/&]+)/i);

  if (!match || !match[1]) {
    return DEFAULT_LATEST_OVERLAY_CATEGORY;
  }

  let category = match[1];
  try {
    category = decodeURIComponent(category);
  } catch {
    // Keep raw category string if URI decoding fails.
  }
  category = category.trim().toLowerCase();
  return category || DEFAULT_LATEST_OVERLAY_CATEGORY;
}

function updateLatestOverlayPageCategory() {
  const nextCategory = getCategoryFromLatestHash();
  const prevCategory = stateManager.get("latestOverlayPageCategory");

  if (prevCategory === nextCategory) {
    return nextCategory;
  }

  stateManager.set("latestOverlayPageCategory", nextCategory);

  if (KNOWN_LATEST_OVERLAY_CATEGORIES.has(nextCategory)) {
    debugLog("Latest Overlay", `Detected latest category: ${nextCategory}`, {
      data: { previous: prevCategory || null, current: nextCategory },
    });
  } else {
    debugLog("Latest Overlay", `Detected custom latest category: ${nextCategory}`, {
      level: "warn",
      data: {
        previous: prevCategory || null,
        current: nextCategory,
        knownCategories: Array.from(KNOWN_LATEST_OVERLAY_CATEGORIES),
      },
    });
  }

  return nextCategory;
}

export function getLatestOverlayPageCategory() {
  return stateManager.get("latestOverlayPageCategory") || DEFAULT_LATEST_OVERLAY_CATEGORY;
}

function hasRelevantLatestOverlayChanges(mutationsList) {
  const currentHash = String(window.location?.hash || "");
  if (currentHash !== latestOverlayLastHash) {
    latestOverlayLastHash = currentHash;
    return true;
  }
  return hasTileMutations(mutationsList);
}

export function enableLatestOverlay() {
  if (stateManager.get("latestOverlayStatus") !== "IDLE") {
    return;
  }

  debugLog("Latest Overlay", "Initializing feature...");
  stateManager.set("latestOverlayStatus", "INITIALIZING");
  latestOverlayLastHash = String(window.location?.hash || "");
  updateLatestOverlayPageCategory();

  const currentGeneration = incrementGeneration();
  refreshCaches();

  processAllTiles(false, currentGeneration);
  addObserverCallback(
    "latest-overlay",
    (mutationsList) => {
      updateLatestOverlayPageCategory();
      processMutations(mutationsList, currentGeneration);
    },
    { filter: hasRelevantLatestOverlayChanges },
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
