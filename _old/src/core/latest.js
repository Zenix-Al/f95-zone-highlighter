import { config, state } from "../constants";
import { getTextColorForGradient } from "../features/handleTextColor";
import { verifyTilesAfterLoad } from "../features/tileVerifier";
import { debugLog } from "../core/debugOutput";

export function watchAndUpdateTiles() {
  const latestUpdateWrapper = document.getElementById("latest-page_items-wrap");
  if (!latestUpdateWrapper) return;

  const mutationObserver = new MutationObserver(() => {
    setTimeout(() => {
      handleWebClick();
    }, 100);
    processAllTiles();
  });

  const options = { childList: true, subtree: true }; // subtree ensures nested additions trigger
  mutationObserver.observe(latestUpdateWrapper, options);
}

export function processAllTiles(reset = false) {
  if (!config.latestSettings.latestOverlayToggle || !state.isLatest) return;
  const tiles = document.getElementsByClassName("resource-tile");

  if (!tiles.length || state.isProcessingTiles) {
    return;
  }

  state.isProcessingTiles = true;
  for (let i = 0; i < tiles.length; i++) {
    processTile(tiles[i], reset); // Apply overlays and styles
  }
  verifyTilesAfterLoad();
  state.isProcessingTiles = false;
}
export function processTile(tile, reset = false) {
  if (tile.dataset.modified === "true" && !reset) return;
  if (reset) tile.dataset.modified = "";
  let isOverlayApplied = false;
  let colors = [];
  const body = tile.querySelector(".resource-tile_body");

  // === Version extraction ===
  const versionText = getVersionText(tile); // e.g., "1.0", "final"
  const match = versionText.match(/(\d+\.\d+)/);
  const versionNumber = match ? parseFloat(match[1]) : null;
  const isValidKeyword = ["full", "final"].some((valid) =>
    versionText.toLowerCase().includes(valid),
  );
  debugLog(
    "Tile Processing",
    `Version Text: ${versionText}, Version Number: ${versionNumber}, Match: ${match}, Is Valid Keyword: ${isValidKeyword}`,
  );
  // === Label / Tag extraction ===
  const labelText = getLabelText(tile); // e.g., "completed"
  const matchedTag = processTag(tile, config.preferredTags);
  const excludedTag = processTag(tile, config.excludedTags);
  debugLog(
    "Tile Processing",
    `Label Text: ${labelText}, Matched Tag: ${matchedTag}, Excluded Tag: ${excludedTag}`,
  );

  // === Excluded ===
  if (excludedTag && config.overlaySettings.excluded) {
    isOverlayApplied = addOverlayLabel(tile, excludedTag, isOverlayApplied);
    colors.push(config.color.excluded);
  }

  // === Preferred ===
  if (matchedTag && config.overlaySettings.preferred) {
    isOverlayApplied = addOverlayLabel(tile, matchedTag, isOverlayApplied);
    colors.push(config.color.preferred);
  }

  // === Status overlays ===
  if (labelText === "completed" && config.overlaySettings.completed) {
    isOverlayApplied = addOverlayLabel(tile, "Completed", isOverlayApplied);
    colors.push(config.color.completed);
  } else if (labelText === "onhold" && config.overlaySettings.onhold) {
    isOverlayApplied = addOverlayLabel(tile, "On Hold", isOverlayApplied);
    colors.push(config.color.onhold);
  } else if (labelText === "abandoned" && config.overlaySettings.abandoned) {
    isOverlayApplied = addOverlayLabel(tile, "Abandoned", isOverlayApplied);
    colors.push(config.color.abandoned);
  }

  // === Version overlays ===
  if (
    (config.overlaySettings.highVersion &&
      versionNumber !== null &&
      versionNumber >= config.latestSettings.minVersion) ||
    isValidKeyword
  ) {
    isOverlayApplied = addOverlayLabel(tile, "High Version", isOverlayApplied);
    colors.push(config.color.highVersion);
  } else if (
    versionNumber !== null &&
    versionNumber < config.latestSettings.minVersion &&
    config.overlaySettings.invalidVersion
  ) {
    addOverlayLabel(tile, "Invalid Version", isOverlayApplied);
    colors.push(config.color.invalidVersion);
  }

  // === Background gradient ===
  body.style.background = "";

  if (colors.length > 0) {
    const gradient = createSegmentedGradient(colors, "45deg");
    body.style.background = gradient;

    // auto text color
    const textColor = getTextColorForGradient(gradient);
    body.style.color = textColor;
    const metas = body.querySelectorAll(".resource-tile_info-meta");

    metas.forEach((meta) => {
      meta.style.color = textColor;
      meta.style.fontWeight = "bold";
    });
  }

  tile.dataset.modified = "true";
}

function addOverlayLabel(tile, reasonText, isApplied) {
  if (isApplied || !config.overlaySettings.overlayText) {
    if (!config.overlaySettings.overlayText) {
      removeOverlayLabel();
    }
    return true;
  }

  const thumbWrap = tile.querySelector(".resource-tile_thumb-wrap");
  if (!thumbWrap) return false;

  let existingOverlay = thumbWrap.querySelector(".custom-overlay-reason");
  if (!existingOverlay) {
    existingOverlay = document.createElement("div");
    existingOverlay.className = "custom-overlay-reason";
    thumbWrap.prepend(existingOverlay);
  }

  existingOverlay.innerText = reasonText;
  return true;
}
export function createSegmentedGradient(colors, direction = "to right") {
  if (!Array.isArray(colors) || colors.length === 0) return "";
  if (colors.length === 1) return colors[0];

  const segment = 100 / colors.length;
  return (
    `linear-gradient(${direction}, ` +
    colors
      .map((color, i) => {
        const start = (i * segment).toFixed(2);
        const end = ((i + 1) * segment).toFixed(2);
        return `${color} ${start}% ${end}%`;
      })
      .join(", ") +
    `)`
  );
}

export function removeOverlayLabel() {
  let existingOverlay = document.querySelector(".custom-overlay-reason");
  if (existingOverlay) {
    existingOverlay.remove();
  }
}

export function getLabelText(tile) {
  const labelWrap = tile.querySelector(".resource-tile_label-wrap_right");
  const labelEl = labelWrap?.querySelector('[class^="label--"]');
  return labelEl?.innerHTML?.toLowerCase().trim() || "";
}

function processTag(tile, tags) {
  const tagIds = (tile.getAttribute("data-tags") || "")
    .split(",")
    .map((id) => parseInt(id.trim(), 10))
    .filter(Number.isFinite);
  debugLog("Tile Processing", `Tag IDs: ${tagIds}`);
  const matchedId = tagIds.find((id) => tags.some((tag) => tag === id));
  debugLog("Tile Processing", `Matched Tag ID: ${matchedId}`);

  if (!matchedId) return false;

  // resolve the name from allTags (master list)
  const matchedTag = config.tags.find((tag) => tag.id == matchedId);
  return matchedTag ? matchedTag.name : false;
}

export function getVersionText(tile) {
  const versionEl = tile.querySelector(".resource-tile_label-version");
  return versionEl?.innerHTML?.toLowerCase().trim() || "";
}

export function toggleWideLatestPage() {
  const root = document.documentElement;

  if (config.latestSettings.wideLatest) {
    root.classList.add("latest-wide", "hide-notices", "header-scroll");
    enableHeaderScrollBehavior();
  } else {
    root.classList.remove("latest-wide", "hide-notices", "header-scroll");
    disableHeaderScrollBehavior();
  }
}

let headerScrollHandler = null;

export function enableHeaderScrollBehavior() {
  if (headerScrollHandler) return; // already enabled

  let lastScrollY = window.scrollY;

  headerScrollHandler = () => {
    const root = document.documentElement;
    const currentY = window.scrollY;

    if (currentY > lastScrollY && currentY > 80) {
      root.classList.add("header-hidden");
    } else {
      root.classList.remove("header-hidden");
    }

    lastScrollY = currentY;
  };

  window.addEventListener("scroll", headerScrollHandler, { passive: true });
}

export function disableHeaderScrollBehavior() {
  if (!headerScrollHandler) return;

  window.removeEventListener("scroll", headerScrollHandler);
  headerScrollHandler = null;

  document.documentElement.classList.remove("header-hidden");
}

export function toggleDenseLatestGrid() {
  const root = document.documentElement;
  if (config.latestSettings.denseLatestGrid) {
    root.classList.add("latest-dense");
  } else {
    root.classList.remove("latest-dense");
  }
}

export function resetAllTiles() {
  if (config.latestSettings.latestOverlayToggle || !state.isLatest) return;
  debugLog("Tile Processing", "Resetting all tiles on Latest Updates page");
  const tiles = document.getElementsByClassName("resource-tile");
  if (!tiles.length) return;

  for (let i = 0; i < tiles.length; i++) {
    resetTile(tiles[i]);
  }
}

export function resetTile(tile) {
  if (tile.dataset.modified !== "true") return;

  const body = tile.querySelector(".resource-tile_body");
  if (!body) return;

  // Remove overlays
  const overlays = tile.querySelectorAll(".resource-tile_overlay");
  overlays.forEach((overlay) => overlay.remove());

  // Remove all inline styles
  body.removeAttribute("style");

  // Reset all meta elements
  const metas = body.querySelectorAll(".resource-tile_info-meta");
  metas.forEach((meta) => meta.removeAttribute("style"));

  // Clear modified flag
  tile.dataset.modified = "";
}

export function autoRefreshClick() {
  const autoRefreshBtn = document.getElementById("controls_auto-refresh");
  if (!autoRefreshBtn) return;

  const selected = autoRefreshBtn.classList.contains("selected");

  if (
    (!selected && config.latestSettings.autoRefresh) ||
    (selected && !config.latestSettings.autoRefresh)
  ) {
    autoRefreshBtn.click();
  }
}

export function webNotifClick() {
  const webNotifBtn = document.getElementById("controls_notify");
  if (!webNotifBtn) return;
  const selected = webNotifBtn.classList.contains("selected");

  if (
    (!selected && config.latestSettings.webNotif) ||
    (selected && !config.latestSettings.webNotif)
  ) {
    webNotifBtn.click();
  }
}

export function handleWebClick() {
  autoRefreshClick();
  webNotifClick();
}
