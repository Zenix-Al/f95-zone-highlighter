import { stateManager } from "../../config.js";
import { debugLog } from "../../core/logger";
import { addObserverCallback, removeObserverCallback } from "../../core/observer";
import { getFastCaptureSnapshot, subscribeFastCapture } from "../../services/fastCapture/index.js";
import {
  getCurrentGeneration,
  incrementGeneration,
  clearMutationState,
  processMutations,
  hasTileMutations,
  processAllTiles,
  reprocessAllTiles,
  processTile,
} from "./tileProcessor.js";
import { resetAllTiles, resetTile } from "./tilePatcher.js";
import { setupHoverListener, teardownHoverListener } from "./hoverTagHandler.js";
import {
  LATEST_DATA_CAPTURE_KEY,
  latestDataIndex,
} from "./latestDataIndex.js";

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
let unsubscribeLatestData = null;

function applyLatestDataSnapshot(snapshot, { processVisibleTiles = true } = {}) {
  const startedAt = performance.now();
  if (!latestDataIndex.replaceSnapshot(snapshot)) {
    debugLog("latest-overlay", "Snapshot unavailable", {
      data: { status: snapshot?.status || "missing", processVisibleTiles },
    });
    return false;
  }
  debugLog("latest-overlay", "Snapshot indexed", {
    data: {
      records: latestDataIndex.records.size,
      transport: latestDataIndex.transport,
      sourceUrl: latestDataIndex.sourceUrl,
      snapshotAgeMs: Math.max(0, Date.now() - latestDataIndex.capturedAt),
      indexingMs: Number((performance.now() - startedAt).toFixed(2)),
      processVisibleTiles,
    },
  });
  if (processVisibleTiles) {
    const generation = incrementGeneration();
    processAllTiles(false, generation, "snapshot");
  }
  return true;
}

function subscribeLatestData() {
  unsubscribeLatestData?.();
  let isInitialSnapshot = true;
  unsubscribeLatestData = subscribeFastCapture(
    LATEST_DATA_CAPTURE_KEY,
    (snapshot) => {
      applyLatestDataSnapshot(snapshot, { processVisibleTiles: !isInitialSnapshot });
      isInitialSnapshot = false;
    },
    { healthId: "Latest Overlay" },
  );
}

function unsubscribeLatestDataCapture() {
  unsubscribeLatestData?.();
  unsubscribeLatestData = null;
  latestDataIndex.clear();
}

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
    debugLog("latest-overlay", "Latest category changed", {
      data: { previous: prevCategory || null, current: nextCategory },
    });
  } else {
    debugLog("latest-overlay", "Unknown latest category detected", {
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
  const currentStatus = stateManager.get("latestOverlayStatus");
  
  // If tearing down, wait for it to complete before enabling
  if (currentStatus === "TEARING_DOWN") {
    debugLog("latest-overlay", "Enable requested while tearing down - deferring...");
    setTimeout(() => enableLatestOverlay(), 50);
    return;
  }

  // If already active, skip
  if (currentStatus === "ACTIVE") {
    return;
  }

  debugLog("latest-overlay", "Enable started", {
    data: {
      snapshotStatus: getFastCaptureSnapshot(LATEST_DATA_CAPTURE_KEY).status,
      visibleTiles: document.getElementsByClassName("resource-tile").length,
      navigationElapsedMs: Number(performance.now().toFixed(2)),
    },
  });
  stateManager.set("latestOverlayStatus", "INITIALIZING");
  latestOverlayLastHash = String(window.location?.hash || "");
  updateLatestOverlayPageCategory();

  const currentGeneration = incrementGeneration();
  subscribeLatestData();

  processAllTiles(false, currentGeneration, "enable");
  addObserverCallback(
    "latest-overlay",
    (mutationsList) => {
      updateLatestOverlayPageCategory();
      processMutations(mutationsList, getCurrentGeneration());
    },
    { filter: hasRelevantLatestOverlayChanges, healthId: "Latest Overlay" },
  );

  setupHoverListener();
  stateManager.set("latestOverlayStatus", "ACTIVE");
  debugLog("latest-overlay", "Enable completed", {
    data: { generation: currentGeneration, navigationElapsedMs: Number(performance.now().toFixed(2)) },
  });
}

export function disableLatestOverlay() {
  const currentStatus = stateManager.get("latestOverlayStatus");
  
  // Allow disable from any active state (idempotent)
  if (currentStatus === "IDLE" || currentStatus === "TEARING_DOWN") {
    return;
  }

  debugLog("latest-overlay", "Disable started");
  stateManager.set("latestOverlayStatus", "TEARING_DOWN");

  incrementGeneration();
  clearMutationState();
  unsubscribeLatestDataCapture();
  teardownHoverListener();

  removeObserverCallback("latest-overlay");
  debugLog("latest-overlay", "Mutation observer removed");

  resetAllTiles();

  stateManager.set("latestOverlayStatus", "IDLE");
  debugLog("latest-overlay", "Disable completed");
}
