import { config } from "../../config.js";
import { SELECTORS } from "../../config/selectors.js";
import { LATEST_OVERLAY_SCORING } from "../../config/latestOverlayScoring.js";
import { calculateRecordAgeDays } from "./latestDataIndex.js";

const DEFAULT_LATEST_CATEGORY = "games";
const RATING_SUPPORTED_CATEGORIES = new Set(["games", "animations"]);

function normalizeLatestCategory(pageCategory) {
  return String(pageCategory || DEFAULT_LATEST_CATEGORY).trim().toLowerCase();
}

function isRatingSupportedForCategory(pageCategory) {
  return RATING_SUPPORTED_CATEGORIES.has(normalizeLatestCategory(pageCategory));
}

/**
 * Calculate engagement ratio using a bounded volume adjustment curve.
 * Calibrated specifically for a baseline configuration threshold of 50.
 * @param {number} likes
 * @param {number} views
 * @returns {number|null} Engagement ratio score (0 to 100+)
 */
/**
 * BRACKET-AWARE ENGAGEMENT SCALE ENGINE
 * Intentionally isolates and balances ultra-high traffic brackets
 * to protect legacy favorites while maintaining the solid low-to-mid accuracy.
 * fine tune needed to fit your specific threshold and distribution patterns.
 */
export function calculateEngagementRatio(likes, views) {
  const ratioConfig = LATEST_OVERLAY_SCORING.engagementRatio;

  if (
    !Number.isFinite(likes) ||
    !Number.isFinite(views) ||
    views <= ratioConfig.minViews ||
    likes <= ratioConfig.minLikes
  ) {
    return null;
  }

  // 1. Core Conversion Value (Scaled up for calculation clarity)
  const basePct = (likes / views) * 100;

  // 2. Bracket-Aware Multiplier Assignment
  // Dynamically expands metrics to match target platform tiers based on total traffic scale.
  let bracketMultiplier;
  let flatBonus = 0;

  if (views >= ratioConfig.ultraMassiveTier.minViews) {
    // Ultra-Massive Tier (20M+ Views): High lurker dilution protection
    bracketMultiplier = ratioConfig.ultraMassiveTier.bracketMultiplier;
    flatBonus = ratioConfig.ultraMassiveTier.flatBonus; // Elevates the floor for verified large community hubs
  } else if (views >= ratioConfig.megaTier.minViews) {
    // Mega Tier (1M to 20M Views)
    bracketMultiplier = ratioConfig.megaTier.bracketMultiplier;
    flatBonus = ratioConfig.megaTier.flatBonus;
  } else if (views >= ratioConfig.hotTier.minViews) {
    // Standard Hot Tier (100K to 1M Views)
    bracketMultiplier = ratioConfig.hotTier.bracketMultiplier;
    flatBonus = ratioConfig.hotTier.flatBonus;
  } else {
    // Fresh/Low Volume Tier (Below 100K Views)
    bracketMultiplier = ratioConfig.lowVolumeTier.bracketMultiplier;
    // Low volume floor protection to match successful Log 1 metrics
    flatBonus = (ratioConfig.lowVolumeBaselineViews - views) / ratioConfig.lowVolumeBonusDivisor;
  }

  // 3. Compute final adjusted matrix score
  const finalScore = basePct * bracketMultiplier + flatBonus;

  // Clamped firmly to fit neatly into your standard config max boundaries
  return parseFloat(
    Math.min(Math.max(finalScore, ratioConfig.clampMin), ratioConfig.clampMax).toFixed(
      ratioConfig.precision,
    ),
  );
}

/**
 * Get CSS class for rating highlight
 * Uses configurable threshold:
 * - Green: rating > threshold
 * - Yellow: rating > threshold / 2
 * - Red: rating <= threshold / 2
 * @param {number} rating - Rating value
 * @param {number} threshold - Threshold value from config
 * @returns {string|null} CSS class name or null
 */
export function getRatingHighlightClass(rating, threshold) {
  if (!Number.isFinite(rating) || !Number.isFinite(threshold) || threshold <= 0) {
    return null;
  }

  const halfThreshold = threshold / 2;

  if (rating > threshold) {
    return "engagement-rating-green";
  } else if (rating > halfThreshold) {
    return "engagement-rating-yellow";
  } else {
    return "engagement-rating-red";
  }
}

/**
 * Get CSS class for engagement ratio highlight
 * Uses configurable threshold:
 * - Green: ratio > threshold
 * - Yellow: ratio > threshold / 2
 * - Red: ratio <= threshold / 2
 * @param {number} ratio - Engagement ratio
 * @param {number} threshold - Threshold value from config
 * @returns {string|null} CSS class name or null
 */
export function getEngagementHighlightClass(ratio, threshold) {
  if (!Number.isFinite(ratio) || !Number.isFinite(threshold) || threshold <= 0) {
    return null;
  }

  const halfThreshold = threshold / 2;

  if (ratio > threshold) {
    return "engagement-ratio-green";
  } else if (ratio > halfThreshold) {
    return "engagement-ratio-yellow";
  } else {
    return "engagement-ratio-red";
  }
}

export function getRecordHighlightClasses(record, capturedAt, pageCategory = "games") {
  const normalizedCategory = normalizeLatestCategory(pageCategory);
  const canUseRating = isRatingSupportedForCategory(normalizedCategory);
  const rating = canUseRating && Number.isFinite(record?.rating) ? record.rating : null;
  const likes = Number.isFinite(record?.likes) ? record.likes : null;
  const views = Number.isFinite(record?.views) && record.views > 0 ? record.views : null;
  const time = calculateRecordAgeDays(record, capturedAt);
  let ratingClass = null;
  let engagementClass = null;

  if (config.overlaySettings.ratingHighlight && rating !== null) {
    ratingClass = getRatingHighlightClass(
      rating,
      config.latestSettings.ratingHighlightThreshold,
    );
  }

  if (config.overlaySettings.engagementHighlight && likes !== null && views !== null) {
    const ratio = calculateEngagementRatio(likes, views);
    if (ratio !== null) {
      engagementClass = getEngagementHighlightClass(
        ratio,
        config.latestSettings.engagementRatioThreshold,
      );
    }
  }

  return { ratingClass, engagementClass, views, time, pageCategory: normalizedCategory };
}

/**
 * Apply highlight classes to specific child elements
 * Rating class applied to .resource-tile_info-meta_rating
 * Engagement class applied to .resource-tile_info-meta_likes
 * @param {Element} tile - The tile DOM element
 * @param {Object} classes - Data-derived rating and engagement classes
 */
export function applyHighlightClasses(tile, classes) {
  const allClasses = [
    "engagement-rating-green",
    "engagement-rating-yellow",
    "engagement-rating-red",
    "engagement-ratio-green",
    "engagement-ratio-yellow",
    "engagement-ratio-red",
  ];

  // Apply rating class to rating element
  const ratingEl = tile.querySelector(SELECTORS.RATING_ENGAGEMENT.RATING);
  if (ratingEl) {
    ratingEl.classList.remove(...allClasses);
    if (classes.ratingClass) {
      ratingEl.classList.add(classes.ratingClass);
    }
  }

  // Apply engagement class to likes element
  const likesEl = tile.querySelector(SELECTORS.RATING_ENGAGEMENT.LIKES);
  if (likesEl) {
    likesEl.classList.remove(...allClasses);
    if (classes.engagementClass) {
      likesEl.classList.add(classes.engagementClass);
    }
  }
}

/**
 * Remove all highlight classes from tile
 * @param {Element} tile - The tile DOM element
 */
export function removeHighlightClasses(tile) {
  const allClasses = [
    "engagement-rating-green",
    "engagement-rating-yellow",
    "engagement-rating-red",
    "engagement-ratio-green",
    "engagement-ratio-yellow",
    "engagement-ratio-red",
  ];

  const ratingEl = tile.querySelector(SELECTORS.RATING_ENGAGEMENT.RATING);
  if (ratingEl) {
    ratingEl.classList.remove(...allClasses);
  }

  const likesEl = tile.querySelector(SELECTORS.RATING_ENGAGEMENT.LIKES);
  if (likesEl) {
    likesEl.classList.remove(...allClasses);
  }
}
