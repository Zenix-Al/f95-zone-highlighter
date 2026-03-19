import { config, STATUS } from "../../config.js";
import { debugLog } from "../../core/logger";
import { cache } from "./overlayCache.js";
import { resolveTagStatus } from "../../utils/resolveTagStatus.js";

// ---------------------------------------------------------------------------
// Hover tag handler — styles individual tag elements inside the hover overlay
// that appears when a user mouses over a tile.
// ---------------------------------------------------------------------------

let tileHoverListener = null;

function findTagIdByName(name) {
  if (!name) return null;
  return cache.tagNameToId?.get(String(name).toLowerCase()) ?? null;
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
}

export function setupHoverListener() {
  if (tileHoverListener) return;

  tileHoverListener = (ev) => {
    try {
      const tile = ev.target?.closest?.(".resource-tile");
      if (!tile) return;

      // The hover wrap may be injected slightly after mouseenter; check both
      // immediately and after a short delay to catch late DOM insertions.
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

export function teardownHoverListener() {
  if (!tileHoverListener) return;
  document.removeEventListener("mouseover", tileHoverListener, true);
  tileHoverListener = null;
}
