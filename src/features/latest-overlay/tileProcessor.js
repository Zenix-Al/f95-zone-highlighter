import { stateManager } from "../../config.js";
import { debugLog } from "../../core/logger.js";
import { SELECTORS } from "../../config/selectors.js";
import { TIMINGS } from "../../config/timings.js";
import { runFrameBudgeted } from "../../core/frameBudget.js";
import { refreshCaches } from "./overlayCache.js";
import { latestDataIndex } from "./latestDataIndex.js";
import { createTileState } from "./tileStateFactory.js";
import { evaluateTileState } from "./overlayEvaluator.js";
import { applyTilePatch, clearAllOverlayStyles } from "./tilePatcher.js";

const LOG_CHANNEL = "latest-overlay";
let generation = 0;
const pendingTiles = new Map();
let mutationFlushScheduled = false;

function currentCategory() {
  return stateManager.get("latestOverlayPageCategory") || "games";
}

function createPatch(tile, reset, context, stats) {
  if (!tile?.isConnected) {
    stats.disconnected += 1;
    return null;
  }
  if (!reset && tile.dataset.modified === "true") {
    stats.alreadyModified += 1;
    return null;
  }
  const record = latestDataIndex.get(tile?.dataset?.threadId);
  if (!record) {
    stats.missingRecord += 1;
    return null;
  }
  const state = createTileState(tile, record, context.capturedAt, context.pageCategory);
  const patch = state ? evaluateTileState(state, { reset }) : null;
  if (!patch) stats.noVisualChange += 1;
  return patch;
}

function applyPatches(patches, expectedGeneration, reason, batchStartedAt) {
  const paintStartedAt = performance.now();
  void runFrameBudgeted(patches, applyTilePatch, {
    budgetMs: TIMINGS.LATEST_OVERLAY_FRAME_BUDGET_MS,
    minChunk: TIMINGS.LATEST_OVERLAY_MIN_CHUNK,
    shouldContinue: () => expectedGeneration === generation,
    startOnNextFrame: false,
  }).then((result) => {
    debugLog(LOG_CHANNEL, "Tile paint completed", {
      data: {
        reason,
        generation: expectedGeneration,
        patches: patches.length,
        completed: result.completed,
        painted: result.processed,
        paintMs: Number((performance.now() - paintStartedAt).toFixed(2)),
        batchTotalMs: Number((performance.now() - batchStartedAt).toFixed(2)),
        captureToPaintMs: latestDataIndex.capturedAt
          ? Math.max(0, Date.now() - latestDataIndex.capturedAt)
          : null,
      },
    });
  });
}

function processTiles(tiles, reset, expectedGeneration, reason = "batch") {
  if (expectedGeneration !== generation) return;
  const batchStartedAt = performance.now();
  const context = {
    capturedAt: latestDataIndex.capturedAt,
    pageCategory: currentCategory(),
  };
  const stats = {
    alreadyModified: 0,
    disconnected: 0,
    missingRecord: 0,
    noVisualChange: 0,
  };
  const patches = tiles.map((tile) => createPatch(tile, reset, context, stats)).filter(Boolean);
  debugLog(LOG_CHANNEL, "Tile batch evaluated", {
    data: {
      reason,
      generation: expectedGeneration,
      reset,
      inputTiles: tiles.length,
      patches: patches.length,
      ...stats,
      evaluationMs: Number((performance.now() - batchStartedAt).toFixed(2)),
      snapshotRecords: latestDataIndex.records.size,
      snapshotAgeMs: latestDataIndex.capturedAt
        ? Math.max(0, Date.now() - latestDataIndex.capturedAt)
        : null,
    },
  });
  if (patches.length > 0) applyPatches(patches, expectedGeneration, reason, batchStartedAt);
}

function scheduleMutationFlush() {
  if (mutationFlushScheduled) return;
  mutationFlushScheduled = true;
  queueMicrotask(() => {
    mutationFlushScheduled = false;
    const expectedGeneration = generation;
    const tiles = [];
    for (const [tile, tileGeneration] of pendingTiles) {
      pendingTiles.delete(tile);
      if (tileGeneration === expectedGeneration) tiles.push(tile);
    }
    processTiles(tiles, false, expectedGeneration, "mutation");
  });
}

export function getCurrentGeneration() {
  return generation;
}

export function incrementGeneration() {
  generation += 1;
  return generation;
}

export function hasTileMutations(mutations) {
  return mutations.some((mutation) => mutation.addedNodes?.length > 0);
}

export function processMutations(mutations, expectedGeneration) {
  if (expectedGeneration !== generation) return;
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes || []) {
      if (node.nodeType !== 1) continue;
      if (node.classList?.contains(SELECTORS.TILE.CLASS)) pendingTiles.set(node, expectedGeneration);
      else {
        node
          .querySelectorAll?.(SELECTORS.TILE.ROOT)
          .forEach((tile) => pendingTiles.set(tile, expectedGeneration));
      }
    }
  }
  if (pendingTiles.size > 0) scheduleMutationFlush();
}

export function clearMutationState() {
  pendingTiles.clear();
  mutationFlushScheduled = false;
}

export function processTile(tile, reset = false) {
  const expectedGeneration = generation;
  const stats = { alreadyModified: 0, disconnected: 0, missingRecord: 0, noVisualChange: 0 };
  const patch = createPatch(
    tile,
    reset,
    {
      capturedAt: latestDataIndex.capturedAt,
      pageCategory: currentCategory(),
    },
    stats,
  );
  if (!patch) return;
  requestAnimationFrame(() => {
    if (expectedGeneration === generation) applyTilePatch(patch);
  });
}

export function processAllTiles(
  reset = false,
  expectedGeneration = generation,
  reason = reset ? "reprocess" : "all",
) {
  if (expectedGeneration !== generation) return;
  refreshCaches();
  if (reset) clearAllOverlayStyles();
  processTiles(
    Array.from(document.getElementsByClassName(SELECTORS.TILE.CLASS)),
    reset,
    expectedGeneration,
    reason,
  );
}

export function reprocessAllTiles() {
  try {
    processAllTiles(true, generation, "settings-reprocess");
  } catch (error) {
    debugLog(LOG_CHANNEL, "Tile reprocess failed", {
      data: { error: error?.message || String(error) },
      level: "error",
    });
  }
}
