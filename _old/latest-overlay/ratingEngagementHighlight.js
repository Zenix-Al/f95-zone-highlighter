import { config } from "../../config.js";
import { debugLog } from "../../core/logger.js";
import { SELECTORS } from "../../config/selectors.js";
import { LATEST_OVERLAY_SCORING } from "../../config/latestOverlayScoring.js";

const DEFAULT_LATEST_CATEGORY = "games";
const RATING_SUPPORTED_CATEGORIES = new Set(["games", "animations"]);

function normalizeLatestCategory(pageCategory) {
  return String(pageCategory || DEFAULT_LATEST_CATEGORY).trim().toLowerCase();
}

function isRatingSupportedForCategory(pageCategory) {
  return RATING_SUPPORTED_CATEGORIES.has(normalizeLatestCategory(pageCategory));
}

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

export function extractDaysElapsed(tile) {
  // 1. Target the parent container you already defined
  const timeContainer = tile.querySelector(SELECTORS.RATING_ENGAGEMENT.TIME);
  if (!timeContainer) return null;

  // 2. Find the active inner span element
  const span = timeContainer.querySelector("span");
  if (!span) return null;

  // 3. Build resilient class/text context (some layouts use singular forms or date_yesterday)
  const text = span.textContent?.trim().toLowerCase() || "";
  const rawValue = parseInt(text, 10);
  const classTokens = Array.from(span.classList);
  const className = span.className || "";
  const hasClassFragment = (fragment) =>
    className.includes(fragment) || classTokens.some((token) => token.includes(fragment));
  const numericValue = Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 1;

  // 4. Handle special "today/yesterday" classes first
  if (hasClassFragment("date_yesterday")) return 1;
  if (hasClassFragment("date_today")) return 1;

  // 5. Handle supported unit classes (both singular and plural variants)
  if (hasClassFragment("tile-date_years") || hasClassFragment("tile-date_year")) {
    return numericValue * 365;
  }
  if (hasClassFragment("tile-date_months") || hasClassFragment("tile-date_month")) {
    return numericValue * 30;
  }
  if (hasClassFragment("tile-date_weeks") || hasClassFragment("tile-date_week")) {
    return numericValue * 7;
  }
  if (hasClassFragment("tile-date_days") || hasClassFragment("tile-date_day")) {
    return numericValue;
  }
  if (
    hasClassFragment("tile-date_mins") ||
    hasClassFragment("tile-date_min") ||
    hasClassFragment("tile-date_hours") ||
    hasClassFragment("tile-date_hour")
  ) {
    return 1;
  }

  // 6. Text fallback for inconsistent markup
  if (text.includes("yesterday")) return 1;
  if (text.includes("today") || text.includes("just now")) return 1;
  if (text.includes("hour") || text.includes("min")) return 1;
  if (text.includes("week")) return numericValue * 7;
  if (text.includes("month")) return numericValue * 30;
  if (text.includes("year")) return numericValue * 365;
  if (text.includes("day")) return numericValue;

  return Number.isFinite(rawValue) ? rawValue : null;
}

/**
 * Extract likes and views from tile element
 * @param {Element} tile - The tile DOM element
 * @returns {Object} {likes: number|null, views: number|null}
 */
export function extractEngagementData(tile) {
  const likes = extractLikes(tile);
  const views = extractViews(tile);
  const time = extractDaysElapsed(tile);
  return { likes, views, time };
}

/**
 * Core utility to safely parse formatted forum metrics (e.g., "1,500", "12.7K", "2.1M")
 * @param {Element|null} element - The DOM element containing text
 * @returns {number|null} Clean floating point number or null
 */
function parseMetricText(element) {
  if (!element) return null;

  // Strip out formatting commas and force uppercase to match suffixes cleanly
  let text = element.textContent?.trim().replace(/,/g, "").toUpperCase() || "";
  if (!text || text === "-") return null;

  let value;
  if (text.endsWith("K")) {
    value = parseFloat(text) * 1000;
  } else if (text.endsWith("M")) {
    value = parseFloat(text) * 1000000;
  } else {
    value = parseFloat(text);
  }

  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Extract likes from tile element, now fully supporting shorthand suffixes
 * @param {Element} tile - The tile DOM element
 * @returns {number|null} Normalized likes count or null
 */
function extractLikes(tile) {
  const likesEl = tile.querySelector(SELECTORS.RATING_ENGAGEMENT.LIKES);
  return parseMetricText(likesEl);
}

/**
 * Extract views from tile element, now fully supporting shorthand suffixes
 * @param {Element} tile - The tile DOM element
 * @returns {number|null} Normalized views count or null
 */
function extractViews(tile) {
  const viewsEl = tile.querySelector(SELECTORS.RATING_ENGAGEMENT.VIEWS);
  const views = parseMetricText(viewsEl);
  // Keep your safety check ensuring views are strictly greater than 0
  return views && views > 0 ? views : null;
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

/**
 * Get highlight information for a tile
 * Returns the appropriate CSS classes and metadata
 * @param {Element} tile - The tile DOM element
 * @returns {Object} {ratingClass: string|null, engagementClass: string|null}
 */
export function getTileHighlightClasses(tile, pageCategory = "games") {
  const normalizedCategory = normalizeLatestCategory(pageCategory);
  const canUseRating = isRatingSupportedForCategory(normalizedCategory);
  const rating = canUseRating ? extractRating(tile) : null;
  debugLog("Latest overlay rating engagement", "extracted rating:", {
    rating,
    pageCategory: normalizedCategory,
    canUseRating,
  });
  const { likes, views, time } = extractEngagementData(tile);
  debugLog("Latest overlay rating engagement", "extracted likes and views:", { likes, views });
  let ratingClass = null;
  let engagementClass = null;

  // Check if rating highlight is enabled
  if (config.overlaySettings.ratingHighlight && canUseRating && rating !== null) {
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

  return { ratingClass, engagementClass, views, time, pageCategory: normalizedCategory };
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
