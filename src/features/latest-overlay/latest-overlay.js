import { config, state } from "../../config";
import { getTextColorForGradient } from "./handleTextColor";
import { debugLog } from "../../core/logger";
import { addObserverCallback, removeObserverCallback } from "../../core/observer";
import { waitFor } from "../../core/dom";
import { createTaskQueue } from "../../core/taskQueue";

let tileQueue = null;

export function enableLatestOverlay() {
  if (
    state.latestOverlayStatus !== "IDLE" ||
    !config.latestSettings.latestOverlayToggle ||
    !state.isLatest
  ) {
    return;
  }

  debugLog("Latest Overlay", "Initializing feature...");
  state.latestOverlayStatus = "INITIALIZING";
  tileQueue = createTaskQueue({ delay: 5, name: "LatestOverlayQueue" });

  // Process new tiles that are added to the DOM dynamically
  function processMutations(mutationsList) {
    for (const mutation of mutationsList) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          if (node.classList?.contains("resource-tile")) {
            tileQueue.add(node, () => processTile(node));
          } else if (node.querySelectorAll) {
            node
              .querySelectorAll(".resource-tile")
              .forEach((tile) => tileQueue.add(tile, () => processTile(tile)));
          }
        }
      }
    }
  }

  processAllTiles(); // Initial run for existing tiles
  addObserverCallback("latest-overlay", processMutations);

  // As a fallback, verify tiles were processed after a delay to fight race conditions
  state.latestOverlayStatus = "ACTIVE";
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
    await waitFor(() => tile.querySelector(".resource-tile_body"), 50, 1500);
  } catch (error) {
    debugLog("Process Tile", "Tile did not populate its content in time, skipping.", "warn");
    return;
  }

  const body = tile.querySelector(".resource-tile_body");
  if (!body) return;

  let isOverlayApplied = false;
  let colors = [];

  // --- 1. Data Extraction (Reverted Logic) ---
  const versionText = getVersionText(tile);
  const labelText = getLabelText(tile);
  const preferredTag = processTag(tile, config.preferredTags);
  const excludedTag = processTag(tile, config.excludedTags);
  const match = versionText.match(/(\d+\.\d+)/);
  const versionNumber = match ? parseFloat(match[1]) : null;
  const isHighVersion = // Combined from old and new logic for clarity
    (versionNumber !== null && versionNumber >= config.latestSettings.minVersion) ||
    ["full", "final"].some((valid) => versionText.toLowerCase().includes(valid));
  const isInvalidVersion =
    versionNumber !== null && versionNumber < config.latestSettings.minVersion;

  // --- 2. Color Collection (Reverted multi-status logic) ---
  if (config.overlaySettings.excluded && excludedTag) {
    isOverlayApplied = addOverlayLabel(tile, excludedTag, isOverlayApplied);
    colors.push(config.color.excluded);
  }
  if (config.overlaySettings.preferred && preferredTag) {
    isOverlayApplied = addOverlayLabel(tile, preferredTag, isOverlayApplied);
    colors.push(config.color.preferred);
  }
  if (config.overlaySettings.completed && labelText === "completed") {
    isOverlayApplied = addOverlayLabel(tile, "Completed", isOverlayApplied);
    colors.push(config.color.completed);
  } else if (config.overlaySettings.onhold && labelText === "onhold") {
    isOverlayApplied = addOverlayLabel(tile, "On Hold", isOverlayApplied);
    colors.push(config.color.onhold);
  } else if (config.overlaySettings.abandoned && labelText === "abandoned") {
    isOverlayApplied = addOverlayLabel(tile, "Abandoned", isOverlayApplied);
    colors.push(config.color.abandoned);
  }
  if (config.overlaySettings.highVersion && isHighVersion) {
    isOverlayApplied = addOverlayLabel(tile, "High Version", isOverlayApplied);
    colors.push(config.color.highVersion);
  } else if (config.overlaySettings.invalidVersion && isInvalidVersion) {
    isOverlayApplied = addOverlayLabel(tile, "Invalid Version", isOverlayApplied);
    colors.push(config.color.invalidVersion);
  }

  // --- 3. DOM Manipulation ---
  if (colors.length > 0) {
    const gradient = createSegmentedGradient(colors, "45deg");
    body.style.background = gradient;

    const textColor = getTextColorForGradient(gradient);
    body.style.color = textColor;
    const metas = body.querySelectorAll(".resource-tile_info-meta");
    metas.forEach((meta) => {
      meta.style.color = textColor;
      meta.style.fontWeight = "bold";
    });

    tile.dataset.modified = "true";
  } else if (wasModified) {
    // If it was modified but no longer has colors, reset it completely.
    resetTile(tile);
  }
}

export function disableLatestOverlay() {
  // Only allow disabling if the feature is fully active.
  if (state.latestOverlayStatus !== "ACTIVE" || !state.isLatest) {
    debugLog(
      "Latest Overlay",
      `Disable called in wrong state: ${state.latestOverlayStatus}. Aborting.`,
    );
    return;
  }
  debugLog("Latest Overlay", "Disabling feature...");
  state.latestOverlayStatus = "TEARING_DOWN";

  removeObserverCallback("latest-overlay");
  debugLog("Latest Overlay", "Observer callback for 'latest-overlay' removed.");

  if (tileQueue) {
    tileQueue.clear();
    tileQueue = null;
    debugLog("Latest Overlay", "Tile processing queue cleared and destroyed.");
  } else {
    debugLog("Latest Overlay", "Tile processing queue was already null.");
  }

  resetAllTiles();

  state.latestOverlayStatus = "IDLE";
  debugLog("Latest Overlay", "Disable complete. State is now IDLE.");
}

export function processAllTiles(reset = false) {
  if (!tileQueue) {
    debugLog(
      "Latest Overlay",
      "processAllTiles called but queue is not initialized. Feature might be disabled.",
    );
    return;
  }
  const tiles = document.getElementsByClassName("resource-tile");
  for (const tile of tiles) {
    tileQueue.add(tile, () => processTile(tile, reset));
  }
}

/**
 * Resets and re-processes all tiles. Useful after settings changes.
 */
export function reprocessAllTiles() {
  if (state.latestOverlayStatus !== "ACTIVE" || !state.isLatest) {
    debugLog(
      "Latest Overlay",
      `Reprocess called in wrong state: ${state.latestOverlayStatus}. Aborting.`,
    );
    return;
  }
  debugLog("Latest Overlay", "Reprocessing all tiles with reset.");
  processAllTiles(true);
}

function resetAllTiles() {
  debugLog("Latest Overlay", "Resetting all modified tiles...");
  const tiles = document.querySelectorAll(".resource-tile[data-modified='true']");
  tiles.forEach(resetTile);
  debugLog("Latest Overlay", `Finished resetting ${tiles.length} tiles.`);
}

/**
 * Resets a tile to its original state, removing all dynamic styles and overlays.
 * @param {HTMLElement} tile The resource tile element to reset.
 */
export function resetTile(tile) {
  if (tile.dataset.modified !== "true") return;

  const body = tile.querySelector(".resource-tile_body");
  if (body) {
    body.removeAttribute("style");
    const metas = body.querySelectorAll(".resource-tile_info-meta");
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

function getVersionText(tile) {
  const versionEl = tile.querySelector(".resource-tile_label-version");
  return versionEl?.innerHTML?.toLowerCase().trim() || "";
}

function getLabelText(tile) {
  const labelWrap = tile.querySelector(".resource-tile_label-wrap_right");
  const labelEl = labelWrap?.querySelector('[class^="label--"]');
  return labelEl?.innerHTML?.toLowerCase().trim() || "";
}

function processTag(tile, tagsToMatch) {
  if (!Array.isArray(tagsToMatch) || tagsToMatch.length === 0) return false;
  const tagsToMatchSet = new Set(tagsToMatch);

  const tileTagIds = (tile.getAttribute("data-tags") || "")
    .split(",")
    .map((id) => parseInt(id.trim(), 10))
    .filter(Number.isFinite);
  if (!tileTagIds.length) return false;

  const matchedId = tileTagIds.find((id) => tagsToMatchSet.has(id));

  if (!matchedId) return false;

  // resolve the name from config.tags (master list)
  const matchedTag = config.tags.find((tag) => tag.id == matchedId);
  debugLog("Tile Processing", `Matched Tag: '${matchedTag?.name}' (ID: ${matchedId}) on tile.`);
  return matchedTag ? matchedTag.name : false;
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

  const thumbWrap = tile.querySelector(".resource-tile_thumb-wrap");
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
