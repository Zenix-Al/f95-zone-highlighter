import { config, STATUS } from "../../config.js";
import { debugLog } from "../../core/logger";
import { cache } from "./overlayCache.js";
import { resolveTagStatus } from "../../utils/resolveTagStatus.js";
import { addObserverCallback, removeObserverCallback } from "../../core/observer.js";

// ---------------------------------------------------------------------------
// Hover tag handler — styles individual tag elements inside the hover overlay
// that appears when a user mouses over a tile.
// ---------------------------------------------------------------------------

let tileHoverListener = null;
let tileLeaveListener = null;
let activeTile = null;
let readinessTimer = null;
const HOVER_OBSERVER_ID = "latest-overlay-hover-tags";
const HOVER_WAIT_MS = 5000;

function findTagIdByName(name) {
  if (!name) return null;
  return cache.tagNameToId?.get(String(name).toLowerCase()) ?? null;
}

function processHoverTagsContainer(container) {
  if (!container || !container.querySelectorAll) return false;

  const tagEls = container.querySelectorAll(".resource-tile_tags span, .resource-tile_tags > *");
  let foundTags = false;
  tagEls.forEach((el) => {
    if (!el) return;

    const txt = String(el.textContent || "").trim();
    if (!txt) return;
    foundTags = true;
    if (el.dataset?.f95ueProcessed === "1") return;

    const id = findTagIdByName(txt);
    let applied = false;

    if (id !== null) {
      const status = resolveTagStatus(id);
      const colorMap = {
        [STATUS.PREFERRED]: [config.color.preferred, config.color.preferredText],
        [STATUS.EXCLUDED]: [config.color.excluded, config.color.excludedText],
        [STATUS.MARKED]: [config.color.marked, config.color.markedText],
      };
      const colors = colorMap[status];
      if (colors) {
        [el.style.backgroundColor, el.style.color] = colors;
        applied = true;
      }
    }

    el.style.fontWeight = applied ? "bold" : "";
    // Mark as processed to avoid reprocessing churn during the same hover.
    el.dataset.f95ueProcessed = "1";
  });
  return foundTags;
}

function stopHoverWait() {
  if (readinessTimer !== null) clearTimeout(readinessTimer);
  readinessTimer = null;
  activeTile = null;
}

function processActiveHover() {
  if (!activeTile?.isConnected) {
    stopHoverWait();
    return;
  }
  const wrap = activeTile.querySelector(".resource-tile_hover-wrap");
  if (processHoverTagsContainer(wrap) && readinessTimer !== null) {
    clearTimeout(readinessTimer);
    readinessTimer = null;
  }
}

function hasHoverContentChanges(mutations) {
  if (!activeTile) return false;
  if (!activeTile.isConnected) return true;
  return mutations.some((mutation) => {
    const target = mutation.target;
    if (!target || !activeTile.contains(target)) return false;
    if (target.closest?.(".resource-tile_hover-wrap")) return true;
    return Array.from(mutation.addedNodes || []).some(
      (node) => node.nodeType === 1 &&
        (node.matches?.(".resource-tile_hover-wrap") ||
          node.querySelector?.(".resource-tile_hover-wrap")),
    );
  });
}

export function setupHoverListener() {
  if (tileHoverListener) return;

  tileHoverListener = (ev) => {
    try {
      const tile = ev.target?.closest?.(".resource-tile");
      if (!tile) return;
      if (ev.relatedTarget?.nodeType && tile.contains(ev.relatedTarget)) return;

      if (activeTile !== tile) {
        stopHoverWait();
        activeTile = tile;
        readinessTimer = setTimeout(stopHoverWait, HOVER_WAIT_MS);
      }
      processActiveHover();
    } catch (err) {
      debugLog("latest-overlay", "Hover tag processing failed", {
        data: { error: err?.message || String(err) },
        level: "error",
      });
    }
  };

  tileLeaveListener = (ev) => {
    if (!activeTile || !activeTile.contains(ev.target)) return;
    if (ev.relatedTarget?.nodeType && activeTile.contains(ev.relatedTarget)) return;
    stopHoverWait();
  };

  document.addEventListener("mouseover", tileHoverListener, true);
  document.addEventListener("mouseout", tileLeaveListener, true);
  addObserverCallback(HOVER_OBSERVER_ID, processActiveHover, {
    filter: hasHoverContentChanges,
    healthId: "latest-overlay",
  });
}

export function teardownHoverListener() {
  if (tileHoverListener) document.removeEventListener("mouseover", tileHoverListener, true);
  if (tileLeaveListener) document.removeEventListener("mouseout", tileLeaveListener, true);
  tileHoverListener = null;
  tileLeaveListener = null;
  removeObserverCallback(HOVER_OBSERVER_ID);
  stopHoverWait();
}
