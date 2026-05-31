import { config } from "../../config.js";
import { debugLog } from "../../core/logger";
import { SELECTORS } from "../../config/selectors.js";
import { TIMINGS } from "../../config/timings.js";
import { buildOrderedOverlayMatches } from "./overlayOrder.js";
import { cache, refreshCaches } from "./overlayCache.js";
import {
  getTileHighlightClasses,
  applyHighlightClasses,
  removeHighlightClasses,
} from "./ratingEngagementHighlight.js";
import { calculateTileScore, applyScoreDisplay, removeScoreDisplay } from "./scoreCalculator.js";

// ---------------------------------------------------------------------------
// Generation counter — incremented on enable/disable to cancel stale work.
// ---------------------------------------------------------------------------
let generationCounter = 0;

export function getCurrentGeneration() {
  return generationCounter;
}

export function incrementGeneration() {
  generationCounter += 1;
  return generationCounter;
}

// ---------------------------------------------------------------------------
// Mutation buffering — batches DOM mutation observations into microtask flushes.
// ---------------------------------------------------------------------------
const pendingMutationTiles = new Set();
let mutationFlushScheduled = false;

export function hasTileMutations(mutationsList) {
  return mutationsList.some((mutation) => mutation.addedNodes && mutation.addedNodes.length > 0);
}

export function processMutations(mutationsList, generation) {
  if (generation !== generationCounter) return;

  for (const mutation of mutationsList) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== 1) continue;

      if (node.classList?.contains(SELECTORS.TILE.CLASS)) {
        pendingMutationTiles.add(node);
      } else {
        node
          .querySelectorAll?.(SELECTORS.TILE.ROOT)
          .forEach((tile) => pendingMutationTiles.add(tile));
      }
    }
  }

  scheduleMutationFlush(generation);
}

function scheduleMutationFlush(generation) {
  if (mutationFlushScheduled) return;
  mutationFlushScheduled = true;

  queueMicrotask(() => {
    mutationFlushScheduled = false;
    if (generation !== generationCounter) {
      pendingMutationTiles.clear();
      return;
    }

    const tiles = Array.from(pendingMutationTiles);
    pendingMutationTiles.clear();
    if (tiles.length === 0) return;

    processTilesBatch(tiles, false, generation);
  });
}

export function clearMutationState() {
  pendingMutationTiles.clear();
  mutationFlushScheduled = false;
}

// ---------------------------------------------------------------------------
// DOM read helpers — extract data from tile elements.
// ---------------------------------------------------------------------------

function extractTileState(tile) {
  // Read highlight classes safely (from ratingEngagementHighlight.js)
  const highlights = getTileHighlightClasses(tile);

  return {
    element: tile, // Keep the reference so we know who to update later
    wasModified: tile.dataset.modified === "true",
    isConnected: tile.isConnected,

    // Extracted raw data
    tags: (tile.getAttribute("data-tags") || "")
      .split(",")
      .map((id) => Number(id.trim()))
      .filter(Number.isFinite),

    versionText: String(tile.querySelector(SELECTORS.TILE.VERSION)?.textContent || "")
      .toLowerCase()
      .trim(),

    labelText: String(
      tile.querySelector(SELECTORS.TILE.LABEL_WRAP)?.querySelector('[class^="label--"]')
        ?.textContent || "",
    )
      .toLowerCase()
      .trim(),

    ratingClass: highlights.ratingClass,
    engagementClass: highlights.engagementClass,
    views: highlights.views,
  };
}
// ---------------------------------------------------------------------------
// DOM write helpers — apply / remove overlay elements.
// ---------------------------------------------------------------------------
function addOverlayLabel(tile, reasonText) {
  const thumbWrap = tile.querySelector(SELECTORS.TILE.THUMB_WRAP);
  if (!thumbWrap) return;

  let overlay = thumbWrap.querySelector(".custom-overlay-reason");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "custom-overlay-reason";
    thumbWrap.prepend(overlay);
  }
  overlay.innerText = reasonText;
}

function removeOverlayLabel(tile) {
  const overlay = tile.querySelector(".custom-overlay-reason");
  if (overlay) overlay.remove();
}

export function resetTile(tile) {
  if (tile.dataset.modified !== "true") return;

  const body = tile.querySelector(SELECTORS.TILE.BODY);
  if (body) {
    body.removeAttribute("style");
    body.classList.remove("custom-overlay-band");
    const metas = body.querySelectorAll(SELECTORS.TILE.INFO_META);
    metas.forEach((meta) => meta.removeAttribute("style"));
  }

  // Remove optional border style applied to the tile element itself
  tile.classList.remove("custom-overlay-border");
  tile.removeAttribute("style");

  // Remove rating and engagement highlight classes
  removeHighlightClasses(tile);

  // Remove score display
  removeScoreDisplay(tile);

  removeOverlayLabel(tile);
  tile.dataset.modified = "";
  debugLog("Tile Reset", "Reset a tile to its original state.");
}

export function resetAllTiles() {
  debugLog("Latest Overlay", "Resetting all modified tiles...");
  const tiles = document.querySelectorAll(SELECTORS.TILE.MODIFIED_SELECTOR);
  tiles.forEach(resetTile);
  debugLog("Latest Overlay", `Finished resetting ${tiles.length} tiles.`);
}

export function clearAllOverlayStyles() {
  debugLog("Latest Overlay", "Clearing overlay styles from all tiles...");
  const tiles = Array.from(document.getElementsByClassName(SELECTORS.TILE.CLASS));
  for (const tile of tiles) {
    try {
      // Clear body-based band
      const body = tile.querySelector(SELECTORS.TILE.BODY);
      if (body) {
        body.removeAttribute("style");
        body.classList.remove("custom-overlay-band");
        const metas = body.querySelectorAll(SELECTORS.TILE.INFO_META);
        metas.forEach((meta) => meta.removeAttribute("style"));
      }

      // Clear border-based style on the tile root
      tile.classList.remove("custom-overlay-border");
      tile.removeAttribute("style");

      // Remove overlay label and modified flag
      const overlay = tile.querySelector(".custom-overlay-reason");
      if (overlay) overlay.remove();

      // Remove rating and engagement highlight classes
      removeHighlightClasses(tile);

      // Remove score display
      removeScoreDisplay(tile);

      tile.dataset.modified = "";
    } catch (err) {
      debugLog(
        "Latest Overlay",
        `Failed clearing styles for a tile: ${err?.message || String(err)}`,
      );
    }
  }
  debugLog("Latest Overlay", `Cleared styles on ${tiles.length} tiles.`);
}

// ---------------------------------------------------------------------------
// Gradient utilities.
// ---------------------------------------------------------------------------
const gradientCache = new Map();

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

function getGradientForColors(colors, direction = "45deg") {
  const key = colors.join("|");
  if (gradientCache.has(key)) return gradientCache.get(key);
  const g = createSegmentedGradient(colors, direction);
  gradientCache.set(key, g);
  return g;
}

// ---------------------------------------------------------------------------
// Tag matching — maps tile tag IDs against preferred / excluded lists,
// returning the first matching tag name found (in priority order).
// ---------------------------------------------------------------------------
function processTag(tileTagIds, excludedTagsArr, preferredTagsArr) {
  if (!Array.isArray(tileTagIds) || tileTagIds.length === 0) {
    return { isExcludedTag: false, isPreferredTag: false, excludedCount: 0, preferredCount: 0 };
  }

  const tileTagSet = new Set(tileTagIds);
  let isExcludedTag = false;
  let isPreferredTag = false;

  // New counters to track the total matches
  let excludedCount = 0;
  let preferredCount = 0;

  const excludedOrder =
    Array.isArray(excludedTagsArr) && excludedTagsArr.length
      ? excludedTagsArr
      : config.excludedTags || [];
  for (const rawId of excludedOrder) {
    const id = Number(rawId);
    if (!Number.isFinite(id) || !tileTagSet.has(id)) continue;

    // 1. Increment the count for every single match found
    excludedCount++;

    // 2. Only fetch the name for the FIRST match (maintaining priority for your UI badge)
    if (!isExcludedTag) {
      isExcludedTag = cache.tagIdToName
        ? cache.tagIdToName.get(id)
        : config.tags.find((t) => t.id == id)?.name;
      if (isExcludedTag) {
        debugLog(
          "Tile Processing",
          `Matched primary excluded Tag: '${isExcludedTag}' (ID: ${id}) on tile.`,
        );
      }
    }
  }

  const preferredOrder =
    Array.isArray(preferredTagsArr) && preferredTagsArr.length
      ? preferredTagsArr
      : config.preferredTags || [];
  for (const rawId of preferredOrder) {
    const id = Number(rawId);
    if (!Number.isFinite(id) || !tileTagSet.has(id)) continue;

    // 1. Increment the count for every single match found
    preferredCount++;

    // 2. Only fetch the name for the FIRST match
    if (!isPreferredTag) {
      isPreferredTag = cache.tagIdToName
        ? cache.tagIdToName.get(id)
        : config.tags.find((t) => t.id == id)?.name;
      if (isPreferredTag) {
        debugLog(
          "Tile Processing",
          `Matched primary preferred Tag: '${isPreferredTag}' (ID: ${id}) on tile.`,
        );
      }
    }
  }

  // Return both the primary text labels AND the total numeric counts
  return {
    isExcludedTag: isExcludedTag || false,
    isPreferredTag: isPreferredTag || false,
    excludedCount,
    preferredCount,
  };
}

// ---------------------------------------------------------------------------
// Tile patch build / apply — core overlay coloring logic.
// ---------------------------------------------------------------------------
function buildTilePatch(tileState, reset, generation) {
  if (generation !== generationCounter || !tileState.isConnected) return null;

  if (!reset && tileState.wasModified) return null;

  const body = tileState.element.querySelector(SELECTORS.TILE.BODY);
  if (!body) return null;

  const colors = [];
  const labels = [];
  const overlayMatches = {};
  const { overlayFlags } = cache;

  // 1. Process Tags using in-memory array
  // Initialize tracking variables for this specific tile
  let totalPreferred = 0;
  let totalExcluded = 0;

  // main overlay logic
  if (overlayFlags.excluded || overlayFlags.preferred) {
    // Destructure the labels along with the newly created counts
    const { isExcludedTag, isPreferredTag, excludedCount, preferredCount } = processTag(
      tileState.tags, // Using memory snapshot
      overlayFlags.excluded ? config.excludedTags : null,
      overlayFlags.preferred ? config.preferredTags : null,
    );

    if (overlayFlags.excluded && isExcludedTag) {
      overlayMatches.excluded = { label: isExcludedTag, color: config.color.excluded };
      totalExcluded = excludedCount; // Store number for calculation
    }

    if (overlayFlags.preferred && isPreferredTag) {
      overlayMatches.preferred = { label: isPreferredTag, color: config.color.preferred };
      totalPreferred = preferredCount; // Store number for calculation
    }
  }

  // 2. Process Status Labels using in-memory string
  if (overlayFlags.completed || overlayFlags.onhold || overlayFlags.abandoned) {
    const labelText = tileState.labelText; // Using memory snapshot
    if (config.overlaySettings.completed && labelText === "completed") {
      overlayMatches.completed = { label: "Completed", color: config.color.completed };
    } else if (config.overlaySettings.onhold && labelText === "onhold") {
      overlayMatches.onhold = { label: "On Hold", color: config.color.onhold };
    } else if (config.overlaySettings.abandoned && labelText === "abandoned") {
      overlayMatches.abandoned = { label: "Abandoned", color: config.color.abandoned };
    }
  }

  // 3. Process Version using in-memory string
  if (overlayFlags.highVersion || overlayFlags.invalidVersion) {
    const versionText = tileState.versionText; // Using memory snapshot
    const match = versionText.match(/(\d+\.\d+)/);
    const versionNumber = match ? parseFloat(match[1]) : null;
    const isInvalidVersion =
      versionNumber !== null && versionNumber < config.latestSettings.minVersion;
    const isHighVersion =
      (versionNumber !== null && versionNumber >= config.latestSettings.minVersion) ||
      ["full", "final"].some((valid) => versionText.includes(valid));

    if (config.overlaySettings.highVersion && isHighVersion) {
      overlayMatches.highVersion = { label: "High Version", color: config.color.highVersion };
    } else if (config.overlaySettings.invalidVersion && isInvalidVersion) {
      overlayMatches.invalidVersion = {
        label: "Invalid Version",
        color: config.color.invalidVersion,
      };
    }
  }

  const orderedMatches = buildOrderedOverlayMatches(overlayMatches, cache.overlayColorOrder);
  labels.push(...orderedMatches.labels);
  colors.push(...orderedMatches.colors);

  // If no visual adjustments or highlights apply, determine action
  if (colors.length === 0 && !tileState.ratingClass && !tileState.engagementClass) {
    if (tileState.wasModified) return { type: "reset", tile: tileState.element };
    return null;
  }

  // 4. Calculate score purely from the snapshot strings
  let score = 0;
  if (config.latestSettings.enableScoreWeights) {
    score = calculateTileScore(
      overlayMatches,
      tileState.ratingClass,
      tileState.engagementClass,
      totalPreferred,
      totalExcluded,
      tileState.views,
    );
  }
  return {
    type: "apply",
    tile: tileState.element, // Return live DOM reference for the Write phase
    gradient: getGradientForColors(colors, "45deg"),
    label: labels[0] || "",
    highlightClasses: {
      ratingClass: tileState.ratingClass,
      engagementClass: tileState.engagementClass,
    },
    score,
  };
}

function applyTilePatch(patch, generation) {
  if (generation !== generationCounter || !patch?.tile?.isConnected) return;

  if (patch.type === "reset") {
    resetTile(patch.tile);
    return;
  }

  const body = patch.tile.querySelector(SELECTORS.TILE.BODY);
  if (!body) return;

  const styleChoice =
    (config.latestSettings && config.latestSettings.latestOverlayStyle) || "strip";

  if (styleChoice === "border") {
    // Apply border style to the tile root
    patch.tile.classList.remove("custom-overlay-band");
    patch.tile.classList.add("custom-overlay-border");
    patch.tile.style.setProperty("--f95ue-overlay-gradient", patch.gradient);
  } else {
    // Default: bottom strip band applied to the tile body
    body.classList.add("custom-overlay-band");
    body.style.setProperty("--f95ue-overlay-gradient", patch.gradient);
  }

  if (cache.overlayFlags?.overlayText && patch.label) {
    addOverlayLabel(patch.tile, patch.label);
  } else {
    removeOverlayLabel(patch.tile);
  }

  // Apply rating and engagement highlight classes
  if (patch.highlightClasses) {
    applyHighlightClasses(patch.tile, patch.highlightClasses);
  }

  // Apply score display
  if (patch.score && patch.score > 0) {
    applyScoreDisplay(patch.tile, patch.score);
  }

  patch.tile.dataset.modified = "true";
}

// ---------------------------------------------------------------------------
// Frame-budgeted batch processing — spreads DOM writes across animation frames.
// ---------------------------------------------------------------------------
function applyPatchesWithFrameBudget(patches, generation) {
  const frameBudget = TIMINGS.LATEST_OVERLAY_FRAME_BUDGET_MS;
  const minChunk = TIMINGS.LATEST_OVERLAY_MIN_CHUNK;
  let index = 0;

  const step = () => {
    if (generation !== generationCounter) return;

    const start = performance.now();
    let processed = 0;

    while (index < patches.length) {
      applyTilePatch(patches[index], generation);
      index += 1;
      processed += 1;

      if (processed >= minChunk && performance.now() - start >= frameBudget) break;
    }

    if (index < patches.length) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

function processTilesBatch(tiles, reset, generation) {
  if (generation !== generationCounter) return;

  const patches = [];
  for (const tile of tiles) {
    const tileState = extractTileState(tile);
    const patch = buildTilePatch(tileState, reset, generation);
    if (patch) patches.push(patch);
  }
  if (patches.length === 0) return;

  applyPatchesWithFrameBudget(patches, generation);
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------
export function processTile(tile, reset = false) {
  const generation = generationCounter;
  const tileState = extractTileState(tile);

  const patch = buildTilePatch(tileState, reset, generation);
  if (!patch) return;
  requestAnimationFrame(() => applyTilePatch(patch, generation));
}

export function processAllTiles(reset = false, generation = generationCounter) {
  if (generation !== generationCounter) return;
  refreshCaches();
  if (reset) {
    // Ensure any previously-applied overlay styles (band or border) are removed
    clearAllOverlayStyles();
  }
  const tiles = Array.from(document.getElementsByClassName(SELECTORS.TILE.CLASS));
  if (tiles.length === 0) return;
  processTilesBatch(tiles, reset, generation);
}

export function reprocessAllTiles() {
  try {
    debugLog("Latest Overlay", "Reprocessing all tiles with reset.");
    processAllTiles(true, generationCounter);
  } catch (err) {
    debugLog("Latest Overlay", `Reprocess failed: ${err?.message || String(err)}`);
  }
}
