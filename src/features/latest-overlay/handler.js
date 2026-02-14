import stateManager, { config } from "../../config.js";
import { getTextColorForGradient } from "./handleTextColor";
import { debugLog } from "../../core/logger";
import { addObserverCallback, removeObserverCallback } from "../../core/observer";
import resourceManager from "../../core/resourceManager.js";
import { waitFor } from "../../core/dom";
import TIMINGS from "../../config/timings.js";
import { isValidTag } from "../../utils/validators.js";
import { SELECTORS } from "../../config/selectors.js";
import { createTaskQueue } from "../../core/taskQueue";

let tileQueue = null;
// A generation counter to invalidate tasks from previous page loads.
// This acts as a "group ID" for all tasks created during a single page view.
let generationCounter = 0;

// Cached lookup structures to avoid expensive per-tile allocations
let preferredTagIdSet = null;
let excludedTagIdSet = null;
let tagIdToName = null;
let overlayFlags = null;

function refreshCaches() {
  preferredTagIdSet = new Set((config.preferredTags || []).map((id) => Number(id)));
  excludedTagIdSet = new Set((config.excludedTags || []).map((id) => Number(id)));
  tagIdToName = new Map();
  (config.tags || []).forEach((t) => {
    tagIdToName.set(Number(t.id), t.name);
  });
  overlayFlags = {
    excluded: Boolean(config.overlaySettings?.excluded),
    preferred: Boolean(config.overlaySettings?.preferred),
    completed: Boolean(config.overlaySettings?.completed),
    onhold: Boolean(config.overlaySettings?.onhold),
    abandoned: Boolean(config.overlaySettings?.abandoned),
    highVersion: Boolean(config.overlaySettings?.highVersion),
    invalidVersion: Boolean(config.overlaySettings?.invalidVersion),
    overlayText: Boolean(config.overlaySettings?.overlayText),
  };
}

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

  // Create the queue on first run, or reuse it.
  if (!tileQueue) {
    tileQueue = createTaskQueue({ delay: 1, name: "LatestOverlayQueue" });
    // Register cleanup so ResourceManager can clear the queue if needed
    resourceManager.register("latest-overlay-queue", () => {
      try {
        if (tileQueue) {
          tileQueue.clear();
          tileQueue = null;
        }
      } catch (err) {
        debugLog("Latest Overlay", `Error cleaning queue: ${err}`);
      }
    });
  }

  // Increment generation and command the queue to purge old tasks.
  generationCounter++;
  const currentGeneration = generationCounter;
  tileQueue.setGeneration(currentGeneration);

  // Prepare caches for faster per-tile processing
  refreshCaches();

  // Process new tiles that are added to the DOM dynamically
  function processMutations(mutationsList) {
    for (const mutation of mutationsList) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          if (node.classList?.contains(SELECTORS.TILE.CLASS)) {
            tileQueue.add(node, () => processTile(node), currentGeneration);
          } else if (node.querySelectorAll) {
            node
              .querySelectorAll(SELECTORS.TILE.ROOT)
              .forEach((tile) => tileQueue.add(tile, () => processTile(tile), currentGeneration));
          }
        }
      }
    }
  }

  processAllTiles(false, currentGeneration); // Initial run for existing tiles
  addObserverCallback("latest-overlay", processMutations);

  // As a fallback, verify tiles were processed after a delay to fight race conditions
  stateManager.set("latestOverlayStatus", "ACTIVE");
  debugLog("Latest Overlay", "Feature is now ACTIVE.");
}

/**
 * Processes a single tile to apply overlays and styles.
 * This version has been reverted to support multi-color gradients for multiple statuses,
 * integrated with the current feature's more robust state management.
 * @param {HTMLElement} tile The resource tile element to process.
 * @param {boolean} [reset=false] Whether to force a reprocessing of the tile.
 */
export async function processTile(tile, reset = false) {
  // This is the most critical check for SPA navigation. If the tile is no longer
  // attached to the document when this task finally runs, abort immediately.
  if (!tile.isConnected) {
    // Silently abort the task. The tile was removed from the DOM during SPA
    // navigation before this task could run. This is expected and not an error,
    // so we don't log it to avoid console spam.
    return;
  }

  const wasModified = tile.dataset.modified === "true";
  if (reset && tile.dataset.modified === "true") {
    // If resetting a modified tile, clean it completely before reprocessing.
    resetTile(tile);
  }
  // If not resetting, and tile is already modified, skip.
  if (wasModified && !reset) return;

  // Wait for the tile's inner content to be ready. This is crucial for tiles
  // added dynamically by the site's JS, fixing the race condition where the
  // tile shell is added before its content.
  try {
    await waitFor(
      () => tile.querySelector(SELECTORS.TILE.BODY),
      TIMINGS.TILE_POPULATE_CHECK_INTERVAL,
      TIMINGS.TILE_POPULATE_TIMEOUT,
    );
  } catch (e) {
    debugLog("Process Tile", "Tile did not populate its content in time, skipping.", {
      level: "warn",
      data: { tile, error: e },
    });
    return;
  }

  const body = tile.querySelector(SELECTORS.TILE.BODY);
  if (!body) return;

  let colors = [];

  // --- 1. Data Extraction (Reverted Logic) ---
  // --- 1. Data Extraction (optimized) ---
  const versionText = getVersionText(tile);
  const labelText = getLabelText(tile);
  const preferredTag = processTag(tile, null); // uses cached sets
  const excludedTag = processTag(tile, null);
  const match = versionText.match(/(\d+\.\d+)/);
  const versionNumber = match ? parseFloat(match[1]) : null;
  const isHighVersion = // Combined from old and new logic for clarity
    (versionNumber !== null && versionNumber >= config.latestSettings.minVersion) ||
    ["full", "final"].some((valid) => versionText.toLowerCase().includes(valid));
  const isInvalidVersion =
    versionNumber !== null && versionNumber < config.latestSettings.minVersion;

  // --- 2. Color Collection (Reverted multi-status logic) ---
  if (overlayFlags.excluded && isValidTag(excludedTag)) {
    addOverlayLabel(tile, excludedTag, false);
    colors.push(config.color.excluded);
  }
  if (overlayFlags.preferred && isValidTag(preferredTag)) {
    addOverlayLabel(tile, preferredTag, false);
    colors.push(config.color.preferred);
  }
  if (config.overlaySettings.completed && labelText === "completed") {
    addOverlayLabel(tile, "Completed", false);
    colors.push(config.color.completed);
  } else if (config.overlaySettings.onhold && labelText === "onhold") {
    addOverlayLabel(tile, "On Hold", false);
    colors.push(config.color.onhold);
  } else if (config.overlaySettings.abandoned && labelText === "abandoned") {
    addOverlayLabel(tile, "Abandoned", false);
    colors.push(config.color.abandoned);
  }
  if (config.overlaySettings.highVersion && isHighVersion) {
    addOverlayLabel(tile, "High Version", false);
    colors.push(config.color.highVersion);
  } else if (config.overlaySettings.invalidVersion && isInvalidVersion) {
    addOverlayLabel(tile, "Invalid Version", false);
    colors.push(config.color.invalidVersion);
  }

  // --- 3. DOM Manipulation ---
  if (colors.length > 0) {
    const gradient = getGradientForColors(colors, "45deg");
    const textColor = getTextColorForGradientCached(gradient);

    // Batch DOM writes to the next animation frame to reduce layout thrash.
    requestAnimationFrame(() => {
      try {
        body.style.background = gradient;
        body.style.color = textColor;
        const metas = body.querySelectorAll(SELECTORS.TILE.INFO_META);
        metas.forEach((meta) => {
          meta.style.color = textColor;
          meta.style.fontWeight = "bold";
        });
        tile.dataset.modified = "true";
      } catch (err) {
        debugLog("Latest Overlay", `DOM write failed: ${err}`);
      }
    });
  } else if (wasModified) {
    // If it was modified but no longer has colors, reset it completely.
    resetTile(tile);
  }
}

export function disableLatestOverlay() {
  // Do not run if the feature is already idle or in the process of tearing down.
  // This allows teardown from an "INITIALIZING" or "ACTIVE" state, fixing the race condition.
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

  removeObserverCallback("latest-overlay");
  debugLog("Latest Overlay", "Observer callback for 'latest-overlay' removed.");

  // Let ResourceManager run the registered cleanup for the queue if present.
  try {
    resourceManager.cleanup("latest-overlay-queue");
    debugLog("Latest Overlay", "Tile processing queue cleaned via ResourceManager.");
  } catch (err) {
    debugLog("Latest Overlay", `Tile processing queue cleanup failed: ${err}`);
  }

  resetAllTiles();

  stateManager.set("latestOverlayStatus", "IDLE");
  debugLog("Latest Overlay", "Disable complete. State is now IDLE.");
}

export function processAllTiles(reset = false, generation) {
  if (!tileQueue) {
    debugLog(
      "Latest Overlay",
      "processAllTiles called but queue is not initialized. Feature might be disabled.",
    );
    return;
  }
  const tiles = document.getElementsByClassName(SELECTORS.TILE.CLASS);
  for (const tile of tiles) {
    tileQueue.add(tile, () => processTile(tile, reset), generation);
  }
}

/**
 * Resets and re-processes all tiles. Useful after settings changes.
 */
export function reprocessAllTiles() {
  if (stateManager.get("latestOverlayStatus") !== "ACTIVE" || !stateManager.get("isLatest")) {
    debugLog(
      "Latest Overlay",
      `Reprocess called in wrong state: ${stateManager.get("latestOverlayStatus")}. Aborting.`,
    );
    return;
  }
  debugLog("Latest Overlay", "Reprocessing all tiles with reset.");
  processAllTiles(true, generationCounter);
}

function resetAllTiles() {
  debugLog("Latest Overlay", "Resetting all modified tiles...");
  const tiles = document.querySelectorAll(SELECTORS.TILE.MODIFIED_SELECTOR);
  tiles.forEach(resetTile);
  debugLog("Latest Overlay", `Finished resetting ${tiles.length} tiles.`);
}

/**
 * Resets a tile to its original state, removing all dynamic styles and overlays.
 * @param {HTMLElement} tile The resource tile element to reset.
 */
export function resetTile(tile) {
  if (tile.dataset.modified !== "true") return;

  const body = tile.querySelector(SELECTORS.TILE.BODY);
  if (body) {
    body.removeAttribute("style");
    const metas = body.querySelectorAll(SELECTORS.TILE.INFO_META);
    metas.forEach((meta) => meta.removeAttribute("style"));
  }

  removeOverlayLabel(tile);
  tile.dataset.modified = "";
  debugLog("Tile Reset", "Reset a tile to its original state.");
}

// --- Helper Functions (private to this module) ---

/**
 * Creates a segmented linear gradient from an array of colors.
 * @param {string[]} colors - Array of CSS color strings.
 * @param {string} [direction="to right"] - Gradient direction.
 * @returns {string} The CSS linear-gradient string.
 */
function createSegmentedGradient(colors, direction = "to right") {
  if (!Array.isArray(colors) || colors.length === 0) return "";
  if (colors.length === 1) return colors[0];

  const segment = 100 / colors.length;
  return (
    `linear-gradient(${direction}, ` +
    colors
      .map((color, i) => {
        return `${color} ${(i * segment).toFixed(2)}% ${((i + 1) * segment).toFixed(2)}%`;
      })
      .join(", ") +
    `)`
  );
}

// Caches for gradients and computed text colors to avoid repeated work
const gradientCache = new Map();
const textColorCache = new Map();

function getGradientForColors(colors, direction = "45deg") {
  const key = colors.join("|");
  if (gradientCache.has(key)) return gradientCache.get(key);
  const g = createSegmentedGradient(colors, direction);
  gradientCache.set(key, g);
  return g;
}

function getTextColorForGradientCached(gradient) {
  if (textColorCache.has(gradient)) return textColorCache.get(gradient);
  const c = getTextColorForGradient(gradient);
  textColorCache.set(gradient, c);
  return c;
}

function getVersionText(tile) {
  const versionEl = tile.querySelector(SELECTORS.TILE.VERSION);
  return String(versionEl?.textContent || "")
    .toLowerCase()
    .trim();
}

function getLabelText(tile) {
  const labelWrap = tile.querySelector(SELECTORS.TILE.LABEL_WRAP);
  const labelEl = labelWrap?.querySelector('[class^="label--"]');
  return String(labelEl?.textContent || "")
    .toLowerCase()
    .trim();
}

function processTag(tile, tagsToMatch) {
  // If tagsToMatch is provided, build a small set; otherwise prefer cached sets.
  let matchSet = null;
  if (Array.isArray(tagsToMatch) && tagsToMatch.length > 0) {
    matchSet = new Set(tagsToMatch.map((id) => Number(id)));
  }

  const tileTagIds = (tile.getAttribute("data-tags") || "")
    .split(",")
    .map((id) => Number(id.trim()))
    .filter(Number.isFinite);
  if (!tileTagIds.length) return false;

  // Try cached sets first when available
  if (!matchSet) {
    for (const id of tileTagIds) {
      if (preferredTagIdSet && preferredTagIdSet.has(id)) {
        const name = tagIdToName.get(id);
        debugLog("Tile Processing", `Matched preferred Tag: '${name}' (ID: ${id}) on tile.`);
        return name || false;
      }
      if (excludedTagIdSet && excludedTagIdSet.has(id)) {
        const name = tagIdToName.get(id);
        debugLog("Tile Processing", `Matched excluded Tag: '${name}' (ID: ${id}) on tile.`);
        return name || false;
      }
    }
    return false;
  }

  const matchedId = tileTagIds.find((id) => matchSet.has(id));
  if (!matchedId) return false;
  const matchedTag = tagIdToName
    ? tagIdToName.get(matchedId)
    : config.tags.find((tag) => tag.id == matchedId)?.name;
  debugLog("Tile Processing", `Matched Tag: '${matchedTag || ""}' (ID: ${matchedId}) on tile.`);
  return matchedTag || false;
}

/**
 * Adds a text label to the tile's thumbnail. Only one label is added per tile.
 * @param {HTMLElement} tile
 * @param {string} reasonText
 * @param {boolean} isApplied - Whether a label has already been applied to this tile.
 * @returns {boolean} True if a label is now present or was already present.
 */
function addOverlayLabel(tile, reasonText, isApplied) {
  if (!config.overlaySettings.overlayText) {
    removeOverlayLabel(tile); // Ensure no label is visible if setting is off
    return isApplied;
  }

  if (isApplied) {
    return true; // A label from a higher-priority rule is already there.
  }

  const thumbWrap = tile.querySelector(SELECTORS.TILE.THUMB_WRAP);
  if (!thumbWrap) return;

  let overlay = thumbWrap.querySelector(".custom-overlay-reason");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "custom-overlay-reason";
    thumbWrap.prepend(overlay);
  }
  overlay.innerText = reasonText;
  return true;
}

/**
 * Removes the text label from a specific tile.
 * @param {HTMLElement} tile
 */
function removeOverlayLabel(tile) {
  const overlay = tile.querySelector(".custom-overlay-reason");
  if (overlay) {
    overlay.remove();
  }
}
