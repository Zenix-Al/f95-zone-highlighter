import stateManager, { config } from "../../config.js";
import { debugLog } from "../../core/logger";
import { addObserverCallback, removeObserverCallback } from "../../core/observer";
import { SELECTORS } from "../../config/selectors.js";
import TIMINGS from "../../config/timings.js";
import {
  OVERLAY_COLOR_ORDER_KEYS,
  buildOrderedOverlayMatches,
  normalizeOverlayColorOrder,
} from "./overlayOrder.js";

let generationCounter = 0;
let tagIdToName = null;
let tagNameToId = null;
let overlayFlags = null;
let overlayColorOrder = OVERLAY_COLOR_ORDER_KEYS;

const pendingMutationTiles = new Set();
let mutationFlushScheduled = false;

function refreshCaches() {
  tagIdToName = new Map();
  (config.tags || []).forEach((t) => {
    tagIdToName.set(Number(t.id), t.name);
  });

  // Build name -> id map for hover-created tag elements (they render names)
  tagNameToId = new Map();
  (config.tags || []).forEach((t) => {
    if (t && typeof t.name !== "undefined") {
      tagNameToId.set(String(t.name).toLowerCase(), Number(t.id));
    }
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

  overlayColorOrder = getOverlayColorOrder();
}

function getOverlayColorOrder() {
  return normalizeOverlayColorOrder(config.latestSettings?.latestOverlayColorOrder);
}

function processMutations(mutationsList, generation) {
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

function hasTileMutations(mutationsList) {
  return mutationsList.some((mutation) => mutation.addedNodes && mutation.addedNodes.length > 0);
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

      if (processed >= minChunk && performance.now() - start >= frameBudget) {
        break;
      }
    }

    if (index < patches.length) {
      requestAnimationFrame(step);
    }
  };

  requestAnimationFrame(step);
}

function buildTilePatch(tile, reset, generation) {
  if (generation !== generationCounter || !tile?.isConnected) return null;

  const wasModified = tile.dataset.modified === "true";
  if (!reset && wasModified) {
    return null;
  }

  const body = tile.querySelector(SELECTORS.TILE.BODY);
  if (!body) return null;

  const colors = [];
  const labels = [];
  const overlayMatches = {};

  if (overlayFlags.excluded || overlayFlags.preferred) {
    const tileTags = getTileTags(tile);
    const { isExcludedTag, isPreferredTag } = processTag(
      tileTags,
      overlayFlags.excluded ? config.excludedTags : null,
      overlayFlags.preferred ? config.preferredTags : null,
    );

    if (overlayFlags.excluded && isExcludedTag) {
      overlayMatches.excluded = {
        label: isExcludedTag,
        color: config.color.excluded,
      };
    }
    if (overlayFlags.preferred && isPreferredTag) {
      overlayMatches.preferred = {
        label: isPreferredTag,
        color: config.color.preferred,
      };
    }
  }

  if (overlayFlags.completed || overlayFlags.onhold || overlayFlags.abandoned) {
    const labelText = getLabelText(tile);
    if (config.overlaySettings.completed && labelText === "completed") {
      overlayMatches.completed = {
        label: "Completed",
        color: config.color.completed,
      };
    } else if (config.overlaySettings.onhold && labelText === "onhold") {
      overlayMatches.onhold = {
        label: "On Hold",
        color: config.color.onhold,
      };
    } else if (config.overlaySettings.abandoned && labelText === "abandoned") {
      overlayMatches.abandoned = {
        label: "Abandoned",
        color: config.color.abandoned,
      };
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
      overlayMatches.highVersion = {
        label: "High Version",
        color: config.color.highVersion,
      };
    } else if (config.overlaySettings.invalidVersion && isInvalidVersion) {
      overlayMatches.invalidVersion = {
        label: "Invalid Version",
        color: config.color.invalidVersion,
      };
    }
  }

  const orderedMatches = buildOrderedOverlayMatches(overlayMatches, overlayColorOrder);
  labels.push(...orderedMatches.labels);
  colors.push(...orderedMatches.colors);

  if (colors.length === 0) {
    if (wasModified) {
      return { type: "reset", tile };
    }
    return null;
  }

  const gradient = getGradientForColors(colors, "45deg");

  return {
    type: "apply",
    tile,
    gradient,
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

  // Apply a bottom horizontal overlay band via CSS class and gradient variable.
  body.classList.add("custom-overlay-band");
  body.style.setProperty("--f95ue-overlay-gradient", patch.gradient);

  if (config.overlaySettings.overlayText && patch.label) {
    addOverlayLabel(patch.tile, patch.label);
  } else {
    removeOverlayLabel(patch.tile);
  }

  patch.tile.dataset.modified = "true";
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

  generationCounter++;
  const currentGeneration = generationCounter;
  refreshCaches();

  processAllTiles(false, currentGeneration);
  addObserverCallback(
    "latest-overlay",
    (mutationsList) => processMutations(mutationsList, currentGeneration),
    { filter: hasTileMutations },
  );

  // Listen for hover-created tag containers and style tags dynamically
  setupHoverListener();
  stateManager.set("latestOverlayStatus", "ACTIVE");
  debugLog("Latest Overlay", "Feature is now ACTIVE.");
}

export async function processTile(tile, reset = false) {
  const generation = generationCounter;
  const patch = buildTilePatch(tile, reset, generation);
  if (!patch) return;

  requestAnimationFrame(() => {
    applyTilePatch(patch, generation);
  });
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

  generationCounter++;
  pendingMutationTiles.clear();
  mutationFlushScheduled = false;
  // remove hover listener first
  teardownHoverListener();

  removeObserverCallback("latest-overlay");
  debugLog("Latest Overlay", "Observer callback for 'latest-overlay' removed.");

  resetAllTiles();

  stateManager.set("latestOverlayStatus", "IDLE");
  debugLog("Latest Overlay", "Disable complete. State is now IDLE.");
}

export function processAllTiles(reset = false, generation = generationCounter) {
  if (generation !== generationCounter) return;
  refreshCaches();

  const tiles = Array.from(document.getElementsByClassName(SELECTORS.TILE.CLASS));
  if (tiles.length === 0) return;
  processTilesBatch(tiles, reset, generation);
}

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

function getTileTags(tile) {
  return (tile.getAttribute("data-tags") || "")
    .split(",")
    .map((id) => Number(id.trim()))
    .filter(Number.isFinite);
}

const gradientCache = new Map();

function getGradientForColors(colors, direction = "45deg") {
  const key = colors.join("|");
  if (gradientCache.has(key)) return gradientCache.get(key);
  const g = createSegmentedGradient(colors, direction);
  gradientCache.set(key, g);
  return g;
}

// Helpers to process tags created inside the hover overlay
function findTagIdByName(name) {
  if (!name) return null;
  return tagNameToId?.get(String(name).toLowerCase()) || null;
}

function processHoverTagsContainer(container) {
  if (!container || !container.querySelectorAll) return;
  const tagEls = container.querySelectorAll(".resource-tile_tags span, .resource-tile_tags > *");
  tagEls.forEach((el) => {
    if (!el || el.dataset?.f95ueProcessed === "1") return;
    const txt = String(el.textContent || "").trim();
    if (!txt) return;

    const id = findTagIdByName(txt);
    let applied = false;
    if (id !== null && Number.isFinite(id)) {
      const excluded =
        Array.isArray(config.excludedTags) && config.excludedTags.map(Number).includes(Number(id));
      const preferred =
        Array.isArray(config.preferredTags) &&
        config.preferredTags.map(Number).includes(Number(id));

      if (excluded) {
        el.style.backgroundColor = config.color.excluded;
        el.style.color = config.color.excludedText;
        applied = true;
      } else if (preferred) {
        el.style.backgroundColor = config.color.preferred;
        el.style.color = config.color.preferredText;
        applied = true;
      }
    }

    // make modified tag visually prominent
    el.style.fontWeight = applied ? "bold" : "";

    // mark as processed even if no style applied to avoid reprocessing churn
    el.dataset.f95ueProcessed = "1";
  });
}

let tileHoverListener = null;
function setupHoverListener() {
  if (tileHoverListener) return;
  tileHoverListener = (ev) => {
    try {
      const tile = ev.target?.closest?.(".resource-tile");
      if (!tile) return;
      // hover-wrap may be added slightly after the mouseenter; check immediately and shortly after
      const applyIfFound = () => {
        const hoverWrap = tile.querySelector(".resource-tile_hover-wrap");
        if (hoverWrap) processHoverTagsContainer(hoverWrap);
      };
      applyIfFound();
      setTimeout(applyIfFound, 50);
    } catch (err) {
      debugLog("Latest Overlay", "tileHoverListener error", err);
    }
  };

  document.addEventListener("mouseover", tileHoverListener, true);
}

function teardownHoverListener() {
  if (!tileHoverListener) return;
  document.removeEventListener("mouseover", tileHoverListener, true);
  tileHoverListener = null;
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
    isExcludedTag = tagIdToName ? tagIdToName.get(id) : config.tags.find((t) => t.id == id)?.name;
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
    isPreferredTag = tagIdToName ? tagIdToName.get(id) : config.tags.find((t) => t.id == id)?.name;
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
  if (overlay) {
    overlay.remove();
  }
}
