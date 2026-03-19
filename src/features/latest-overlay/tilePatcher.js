import { config } from "../../config.js";
import { debugLog } from "../../core/logger";
import { SELECTORS } from "../../config/selectors.js";
import TIMINGS from "../../config/timings.js";
import { buildOrderedOverlayMatches } from "./overlayOrder.js";
import { cache, refreshCaches } from "./overlayCache.js";

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
      } else if (node.querySelectorAll) {
        node
          .querySelectorAll(SELECTORS.TILE.ROOT)
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
function getTileTags(tile) {
  return (tile.getAttribute("data-tags") || "")
    .split(",")
    .map((id) => Number(id.trim()))
    .filter(Number.isFinite);
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
    return { isExcludedTag: false, isPreferredTag: false };
  }

  const tileTagSet = new Set(tileTagIds);
  let isExcludedTag = false;
  let isPreferredTag = false;

  const excludedOrder =
    Array.isArray(excludedTagsArr) && excludedTagsArr.length
      ? excludedTagsArr
      : config.excludedTags || [];
  for (const rawId of excludedOrder) {
    const id = Number(rawId);
    if (!Number.isFinite(id) || !tileTagSet.has(id)) continue;
    isExcludedTag = cache.tagIdToName
      ? cache.tagIdToName.get(id)
      : config.tags.find((t) => t.id == id)?.name;
    if (isExcludedTag) {
      debugLog("Tile Processing", `Matched excluded Tag: '${isExcludedTag}' (ID: ${id}) on tile.`);
      break;
    }
  }

  const preferredOrder =
    Array.isArray(preferredTagsArr) && preferredTagsArr.length
      ? preferredTagsArr
      : config.preferredTags || [];
  for (const rawId of preferredOrder) {
    const id = Number(rawId);
    if (!Number.isFinite(id) || !tileTagSet.has(id)) continue;
    isPreferredTag = cache.tagIdToName
      ? cache.tagIdToName.get(id)
      : config.tags.find((t) => t.id == id)?.name;
    if (isPreferredTag) {
      debugLog(
        "Tile Processing",
        `Matched preferred Tag: '${isPreferredTag}' (ID: ${id}) on tile.`,
      );
      break;
    }
  }

  return { isExcludedTag: isExcludedTag || false, isPreferredTag: isPreferredTag || false };
}

// ---------------------------------------------------------------------------
// Tile patch build / apply — core overlay coloring logic.
// ---------------------------------------------------------------------------
function buildTilePatch(tile, reset, generation) {
  if (generation !== generationCounter || !tile?.isConnected) return null;

  const wasModified = tile.dataset.modified === "true";
  if (!reset && wasModified) return null;

  const body = tile.querySelector(SELECTORS.TILE.BODY);
  if (!body) return null;

  const colors = [];
  const labels = [];
  const overlayMatches = {};
  const { overlayFlags } = cache;

  if (overlayFlags.excluded || overlayFlags.preferred) {
    const tileTags = getTileTags(tile);
    const { isExcludedTag, isPreferredTag } = processTag(
      tileTags,
      overlayFlags.excluded ? config.excludedTags : null,
      overlayFlags.preferred ? config.preferredTags : null,
    );

    if (overlayFlags.excluded && isExcludedTag) {
      overlayMatches.excluded = { label: isExcludedTag, color: config.color.excluded };
    }
    if (overlayFlags.preferred && isPreferredTag) {
      overlayMatches.preferred = { label: isPreferredTag, color: config.color.preferred };
    }
  }

  if (overlayFlags.completed || overlayFlags.onhold || overlayFlags.abandoned) {
    const labelText = getLabelText(tile);
    if (config.overlaySettings.completed && labelText === "completed") {
      overlayMatches.completed = { label: "Completed", color: config.color.completed };
    } else if (config.overlaySettings.onhold && labelText === "onhold") {
      overlayMatches.onhold = { label: "On Hold", color: config.color.onhold };
    } else if (config.overlaySettings.abandoned && labelText === "abandoned") {
      overlayMatches.abandoned = { label: "Abandoned", color: config.color.abandoned };
    }
  }

  if (overlayFlags.highVersion || overlayFlags.invalidVersion) {
    const versionText = getVersionText(tile);
    const match = versionText.match(/(\d+\.\d+)/);
    const versionNumber = match ? parseFloat(match[1]) : null;
    const isInvalidVersion =
      versionNumber !== null && versionNumber < config.latestSettings.minVersion;
    const isHighVersion =
      (versionNumber !== null && versionNumber >= config.latestSettings.minVersion) ||
      ["full", "final"].some((valid) => versionText.toLowerCase().includes(valid));

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

  if (colors.length === 0) {
    if (wasModified) return { type: "reset", tile };
    return null;
  }

  return {
    type: "apply",
    tile,
    gradient: getGradientForColors(colors, "45deg"),
    label: labels[0] || "",
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

  body.classList.add("custom-overlay-band");
  body.style.setProperty("--f95ue-overlay-gradient", patch.gradient);

  if (cache.overlayFlags?.overlayText && patch.label) {
    addOverlayLabel(patch.tile, patch.label);
  } else {
    removeOverlayLabel(patch.tile);
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
    const patch = buildTilePatch(tile, reset, generation);
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
  const patch = buildTilePatch(tile, reset, generation);
  if (!patch) return;
  requestAnimationFrame(() => applyTilePatch(patch, generation));
}

export function processAllTiles(reset = false, generation = generationCounter) {
  if (generation !== generationCounter) return;
  refreshCaches();

  const tiles = Array.from(document.getElementsByClassName(SELECTORS.TILE.CLASS));
  if (tiles.length === 0) return;
  processTilesBatch(tiles, reset, generation);
}

export function reprocessAllTiles() {
  debugLog("Latest Overlay", "Reprocessing all tiles with reset.");
  processAllTiles(true, generationCounter);
}
