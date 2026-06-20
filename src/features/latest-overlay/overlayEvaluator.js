import { config } from "../../config.js";
import { buildOrderedOverlayMatches } from "./overlayOrder.js";
import { cache } from "./overlayCache.js";
import { calculateTileScore } from "./scoreCalculator.js";

const gradientCache = new Map();

function segmentedGradient(colors, direction = "45deg") {
  if (colors.length === 0) return "";
  if (colors.length === 1) return colors[0];
  const key = `${direction}|${colors.join("|")}`;
  if (gradientCache.has(key)) return gradientCache.get(key);
  const segment = 100 / colors.length;
  const gradient = `linear-gradient(${direction}, ${colors
    .map(
      (color, index) =>
        `${color} ${(index * segment).toFixed(2)}% ${((index + 1) * segment).toFixed(2)}%`,
    )
    .join(", ")})`;
  gradientCache.set(key, gradient);
  return gradient;
}

function matchConfiguredTags(tileTagIds, configuredIds) {
  const tileTags = new Set(tileTagIds);
  let label = false;
  let count = 0;
  for (const rawId of Array.isArray(configuredIds) ? configuredIds : []) {
    const id = Number(rawId);
    if (!Number.isFinite(id) || !tileTags.has(id)) continue;
    count += 1;
    if (!label) label = cache.tagIdToName?.get(id) || false;
  }
  return { label, count };
}

function addPreferenceMatches(tileState, matches) {
  let preferredCount = 0;
  let excludedCount = 0;
  if (cache.overlayFlags.excluded) {
    const excluded = matchConfiguredTags(tileState.tags, config.excludedTags);
    excludedCount = excluded.count;
    if (excluded.label) {
      matches.excluded = { label: excluded.label, color: config.color.excluded };
    }
  }
  if (cache.overlayFlags.preferred) {
    const preferred = matchConfiguredTags(tileState.tags, config.preferredTags);
    preferredCount = preferred.count;
    if (preferred.label) {
      matches.preferred = { label: preferred.label, color: config.color.preferred };
    }
  }
  return { preferredCount, excludedCount };
}

function addStatusMatches(tileState, matches) {
  if (tileState.pageCategory !== "games") return;
  if (cache.overlayFlags.completed && tileState.statuses.has("completed")) {
    matches.completed = { label: "Completed", color: config.color.completed };
  } else if (cache.overlayFlags.onhold && tileState.statuses.has("onhold")) {
    matches.onhold = { label: "On Hold", color: config.color.onhold };
  } else if (cache.overlayFlags.abandoned && tileState.statuses.has("abandoned")) {
    matches.abandoned = { label: "Abandoned", color: config.color.abandoned };
  }
}

function addVersionMatches(tileState, matches) {
  if (tileState.pageCategory !== "games") return;
  if (!cache.overlayFlags.highVersion && !cache.overlayFlags.invalidVersion) return;
  const versionMatch = tileState.versionText.match(/(\d+\.\d+)/);
  const version = versionMatch ? Number.parseFloat(versionMatch[1]) : null;
  const isInvalid = version !== null && version < config.latestSettings.minVersion;
  const isHigh =
    (version !== null && version >= config.latestSettings.minVersion) ||
    ["full", "final"].some((value) => tileState.versionText.includes(value));

  if (cache.overlayFlags.highVersion && isHigh) {
    matches.highVersion = { label: "High Version", color: config.color.highVersion };
  } else if (cache.overlayFlags.invalidVersion && isInvalid) {
    matches.invalidVersion = { label: "Invalid Version", color: config.color.invalidVersion };
  }
}

export function evaluateTileState(tileState, { reset = false } = {}) {
  if (!tileState?.isConnected) return null;
  if (!reset && tileState.wasModified) return null;

  const matches = {};
  const { preferredCount, excludedCount } = addPreferenceMatches(tileState, matches);
  addStatusMatches(tileState, matches);
  addVersionMatches(tileState, matches);

  const ordered = buildOrderedOverlayMatches(matches, cache.overlayColorOrder);
  if (ordered.colors.length === 0 && !tileState.ratingClass && !tileState.engagementClass) {
    return tileState.wasModified ? { type: "reset", tile: tileState.element } : null;
  }

  const score = config.latestSettings.enableScoreWeights
    ? calculateTileScore(
        matches,
        tileState.ratingClass,
        tileState.engagementClass,
        preferredCount,
        excludedCount,
        tileState.views,
        tileState.time,
        tileState.pageCategory,
      )
    : 0;

  return {
    type: "apply",
    tile: tileState.element,
    gradient: segmentedGradient(ordered.colors),
    label: ordered.labels[0] || "",
    highlightClasses: {
      ratingClass: tileState.ratingClass,
      engagementClass: tileState.engagementClass,
    },
    score,
  };
}
