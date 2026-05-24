import { config } from "../../config.js";
import { debugLog } from "../../core/logger.js";
import { SELECTORS } from "../../config/selectors.js";

/**
 * Extract rating value from tile element
 * Handles "-" as no rating, returns null in that case
 * @param {Element} tile - The tile DOM element
 * @returns {number|null} Rating value or null if not found or is "-"
 */
export function extractRating(tile) {
  debugLog("Latest overlay rating engagement", "extracting rating from tile:", { tile });
  const ratingEl = tile.querySelector(SELECTORS.RATING_ENGAGEMENT.RATING);
  if (!ratingEl) return null;
  debugLog("Latest overlay rating engagement", "extracting rating from element:", { ratingEl });
  const text = ratingEl.textContent?.trim();
  if (text === "-") return null; // No rating yet
  const rating = parseFloat(text);
  return Number.isFinite(rating) ? rating : null;
}

/**
 * Extract likes and views from tile element
 * @param {Element} tile - The tile DOM element
 * @returns {Object} {likes: number|null, views: number|null}
 */
export function extractEngagementData(tile) {
  const likes = extractLikes(tile);
  const views = extractViews(tile);
  return { likes, views };
}

function extractLikes(tile) {
  const likesEl = tile.querySelector(SELECTORS.RATING_ENGAGEMENT.LIKES);
  if (!likesEl) return null;
  const likes = parseInt(likesEl.textContent?.trim(), 10);
  return Number.isFinite(likes) ? likes : null;
}

function extractViews(tile) {
  const viewsEl = tile.querySelector(SELECTORS.RATING_ENGAGEMENT.VIEWS);
  if (!viewsEl) return null;
  const viewsText = viewsEl.textContent?.trim() || "";

  // Handle formats like "513K", "2M", "1.5K", etc.
  let views;
  if (viewsText.endsWith("K")) {
    views = parseFloat(viewsText) * 1000;
  } else if (viewsText.endsWith("M")) {
    views = parseFloat(viewsText) * 1000000;
  } else {
    views = parseInt(viewsText, 10);
  }

  return Number.isFinite(views) && views > 0 ? views : null;
}

/**
 * Calculate engagement ratio (likes per 1000 views)
 * @param {number} likes
 * @param {number} views
 * @returns {number|null} Engagement ratio or null
 */
export function calculateEngagementRatio(likes, views) {
  if (!Number.isFinite(likes) || !Number.isFinite(views) || views === 0) {
    return null;
  }
  return (likes / views) * 100000;
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

/**
 * Get highlight information for a tile
 * Returns the appropriate CSS classes and metadata
 * @param {Element} tile - The tile DOM element
 * @returns {Object} {ratingClass: string|null, engagementClass: string|null}
 */
export function getTileHighlightClasses(tile) {
  const rating = extractRating(tile);
  debugLog("Latest overlay rating engagement", "extracted rating:", { rating });
  const { likes, views } = extractEngagementData(tile);
  debugLog("Latest overlay rating engagement", "extracted likes and views:", { likes, views });
  let ratingClass = null;
  let engagementClass = null;

  // Check if rating highlight is enabled
  if (config.overlaySettings.ratingHighlight && rating !== null) {
    // Get rating threshold from config
    const ratingThreshold = config.latestSettings.ratingHighlightThreshold;
    ratingClass = getRatingHighlightClass(rating, ratingThreshold);
  }

  // Check if engagement highlight is enabled
  if (config.overlaySettings.engagementHighlight && likes !== null && views !== null) {
    const ratio = calculateEngagementRatio(likes, views);
    if (ratio !== null) {
      const engagementThreshold = config.latestSettings.engagementRatioThreshold;
      engagementClass = getEngagementHighlightClass(ratio, engagementThreshold);
    }
  }

  return { ratingClass, engagementClass };
}

/**
 * Apply highlight classes to specific child elements
 * Rating class applied to .resource-tile_info-meta_rating
 * Engagement class applied to .resource-tile_info-meta_likes
 * @param {Element} tile - The tile DOM element
 * @param {Object} classes - {ratingClass, engagementClass} from getTileHighlightClasses
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
