import { config, debug } from "../constants";

export function watchAndUpdateTiles() {
  const mutationObserver = new MutationObserver(() => {
    processAllTiles();
  });

  const latestUpdateWrapper = document.getElementById("latest-page_items-wrap");
  if (!latestUpdateWrapper) return;

  const options = {
    childList: true,
  };

  mutationObserver.observe(latestUpdateWrapper, options);
}
export function processAllTiles(reset = false) {
  const tiles = document.getElementsByClassName("resource-tile");

  if (!tiles.length) {
    return;
  }

  for (let i = 0; i < tiles.length; i++) {
    processTile(tiles[i], reset); // Apply overlays and styles
  }
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
    versionText.toLowerCase().includes(valid)
  );
  debug && console.log(versionText, versionNumber, match, isValidKeyword);
  // === Label / Tag extraction ===
  const labelText = getLabelText(tile); // e.g., "completed"
  const matchedTag = processTag(tile, config.preferredTags);
  const excludedTag = processTag(tile, config.excludedTags);
  debug && console.log(labelText, matchedTag, excludedTag);

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
      config.versionNumber !== null &&
      config.versionNumber >= config.minVersion) ||
    isValidKeyword
  ) {
    isOverlayApplied = addOverlayLabel(tile, "High Version", isOverlayApplied);
    colors.push(config.color.highVersion);
  } else if (
    config.versionNumber !== null &&
    config.versionNumber < config.minVersion &&
    config.overlaySettings.invalidVersion
  ) {
    isOverlayApplied = addOverlayLabel(tile, "Invalid Version", isOverlayApplied);
    colors.push(config.color.invalidVersion);
  }

  // === Background gradient ===
  body.style.background = "";

  if (colors.length > 0) {
    body.style.background = createSegmentedGradient(colors, "45deg");
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
  debug && console.log(tagIds);
  const matchedId = tagIds.find((id) => tags.some((tag) => tag === id));
  debug && console.log(matchedId);

  if (!matchedId) return false;

  // resolve the name from allTags (master list)
  const matchedTag = config.tags.find((tag) => tag.id == matchedId);
  return matchedTag ? matchedTag.name : false;
}

export function getVersionText(tile) {
  const versionEl = tile.querySelector(".resource-tile_label-version");
  return versionEl?.innerHTML?.toLowerCase().trim() || "";
}
