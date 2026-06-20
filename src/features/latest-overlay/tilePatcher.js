import { config } from "../../config.js";
import { debugLog } from "../../core/logger.js";
import { SELECTORS } from "../../config/selectors.js";
import { cache } from "./overlayCache.js";
import { applyHighlightClasses, removeHighlightClasses } from "./ratingEngagementHighlight.js";
import { applyScoreDisplay, removeScoreDisplay } from "./scoreCalculator.js";

const LOG_CHANNEL = "latest-overlay";
function addOverlayLabel(tile, text) {
  const thumb = tile.querySelector(SELECTORS.TILE.THUMB_WRAP);
  if (!thumb) return;
  let overlay = thumb.querySelector(".custom-overlay-reason");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "custom-overlay-reason";
    thumb.prepend(overlay);
  }
  overlay.innerText = text;
}

function removeOverlayLabel(tile) {
  tile.querySelector(".custom-overlay-reason")?.remove();
}

function clearTileStyles(tile) {
  const body = tile.querySelector(SELECTORS.TILE.BODY);
  if (body) {
    body.style.removeProperty("--f95ue-overlay-gradient");
    body.classList.remove("custom-overlay-band");
  }
  tile.classList.remove("custom-overlay-band", "custom-overlay-border");
  tile.style.removeProperty("--f95ue-overlay-gradient");
  removeHighlightClasses(tile);
  removeScoreDisplay(tile);
  removeOverlayLabel(tile);
  delete tile.dataset.modified;
}

export function resetTile(tile) {
  if (tile?.dataset?.modified !== "true") return;
  clearTileStyles(tile);
}

export function resetAllTiles() {
  document.querySelectorAll(SELECTORS.TILE.MODIFIED_SELECTOR).forEach(resetTile);
}

export function clearAllOverlayStyles() {
  for (const tile of document.getElementsByClassName(SELECTORS.TILE.CLASS)) {
    try {
      clearTileStyles(tile);
    } catch (error) {
      debugLog(LOG_CHANNEL, "Tile cleanup failed", {
        data: { error: error?.message || String(error) },
        level: "error",
      });
    }
  }
}

export function applyTilePatch(patch) {
  if (!patch?.tile?.isConnected) return;
  if (patch.type === "reset") {
    resetTile(patch.tile);
    return;
  }

  const body = patch.tile.querySelector(SELECTORS.TILE.BODY);
  if (!body) return;
  const style = config.latestSettings?.latestOverlayStyle || "strip";
  if (style === "border") {
    body.classList.remove("custom-overlay-band");
    body.style.removeProperty("--f95ue-overlay-gradient");
    patch.tile.classList.add("custom-overlay-border");
    patch.tile.style.setProperty("--f95ue-overlay-gradient", patch.gradient);
  } else {
    patch.tile.classList.remove("custom-overlay-border");
    patch.tile.style.removeProperty("--f95ue-overlay-gradient");
    body.classList.add("custom-overlay-band");
    body.style.setProperty("--f95ue-overlay-gradient", patch.gradient);
  }

  if (cache.overlayFlags?.overlayText && patch.label) addOverlayLabel(patch.tile, patch.label);
  else removeOverlayLabel(patch.tile);
  if (patch.highlightClasses) applyHighlightClasses(patch.tile, patch.highlightClasses);
  if (patch.score > 0) applyScoreDisplay(patch.tile, patch.score);
  else removeScoreDisplay(patch.tile);
  patch.tile.dataset.modified = "true";
}
