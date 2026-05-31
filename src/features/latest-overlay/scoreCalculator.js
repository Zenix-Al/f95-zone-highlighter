import { config, defaultPriorityWeights, defaultTagModifiers } from "../../config.js";
import { SELECTORS } from "../../config/selectors.js";
import { debugLog } from "../../core/logger.js";

/**
 * Score Calculator for Latest Overlay Tiles
 * Calculates a bounded 0-10 statistical rating using relative priority weights.
 * Displays on the right side of the tile
 */

/**
 * Determine performance grade from rating highlight
 * @param {string|null} ratingClass - CSS class from rating highlight
 * @returns {number} Normalized grade from 0.0 (worst) to 1.0 (best)
 */
function getRatingConfidence(views) {
  if (views < 2000) return 0.0; // ignore entirely
  if (views < 5000) return 0.3;
  if (views < 10000) return 0.7;
  return 1.0;
}
function getRatingGrade(ratingClass) {
  if (!ratingClass) return null;
  if (ratingClass.includes("green")) return 1.0;
  if (ratingClass.includes("yellow")) return 0.5;
  if (ratingClass.includes("red")) return 0.0;
  return null;
}

/**
 * Determine performance grade from engagement highlight
 * @param {string|null} engagementClass - CSS class from engagement highlight
 * @returns {number} Normalized grade from 0.0 (worst) to 1.0 (best)
 */

function getEngagementGrade(engagementClass) {
  if (!engagementClass) return 0.3; // neutral
  if (engagementClass.includes("green")) return 0.75; // was 1.0 → lowered
  if (engagementClass.includes("yellow")) return 0.45; // was 0.6 → lowered
  if (engagementClass.includes("red")) return 0.1; // keep low
  return 0.3; // neutral default
}

/**
 * Calculate tile score based on overlay status and highlights using a Statistical Matrix
 * @param {Object} overlayMatches - Matched overlays
 * @param {string|null} ratingClass - Rating highlight class
 * @param {string|null} engagementClass - Engagement highlight class
 * @param {number} preferredCount - Count of preferred tags
 * @param {number} excludedCount - Count of excluded tags
 * @returns {number} Score 0-10
 */
export function calculateTileScore(
  overlayMatches = {},
  ratingClass = null,
  engagementClass = null,
  preferredCount = 0,
  excludedCount = 0,
  views = 0,
) {
  debugLog("Latest overlay score calculation", {
    engagementClass,
    ratingClass,
    preferredCount,
    excludedCount,
    overlayMatches,
  });

  const priorities = config.latestSettings?.priorityWeights || defaultPriorityWeights;
  const tagModifiers = config.latestSettings?.tagModifiers || defaultTagModifiers;

  debugLog("Score calculation - Config Check", {
    configPriorities: config.latestSettings?.priorityWeights,
    configTagModifiers: config.latestSettings?.tagModifiers,
    usedPriorities: priorities,
    usedTagModifiers: tagModifiers,
  });

  let totalWeightedScore = 0;
  let totalConfiguredWeight = 0;
  let totalAchievedWeight = 0;

  // ====================== RATING PILLAR ======================
  if (config.overlaySettings?.ratingHighlight && priorities.rating > 0) {
    const ratingGrade = getRatingGrade(ratingClass);

    const ratingConfidence = getRatingConfidence(views);
    const ratingWeight = priorities.rating * ratingConfidence;

    totalConfiguredWeight += ratingWeight;

    if (ratingGrade !== null) {
      totalWeightedScore += ratingGrade * ratingWeight;

      if (ratingGrade >= 1.0) {
        totalAchievedWeight += ratingWeight;
      }
    }
  }

  // ====================== ENGAGEMENT PILLAR ======================
  if (config.overlaySettings?.engagementHighlight && priorities.engagement > 0) {
    const engagementGrade = getEngagementGrade(engagementClass);
    totalConfiguredWeight += priorities.engagement;

    if (engagementGrade) {
      totalWeightedScore += engagementGrade * priorities.engagement;

      // Engagement is handicapped → 0.7+ is "good enough" for achievement credit
      if (engagementGrade >= 0.7) {
        totalAchievedWeight += priorities.engagement;
      }
    }
  }

  // ====================== TAGS PILLAR (Neutralized, Low-Blow Version) ======================
  if (priorities.tags > 0) {
    totalConfiguredWeight += priorities.tags;

    const hasAnyTagSignal =
      preferredCount > 0 ||
      excludedCount > 0 ||
      overlayMatches.completed ||
      overlayMatches.highVersion ||
      overlayMatches.invalidVersion ||
      overlayMatches.onhold ||
      overlayMatches.abandoned;

    let tagGrade = 0.5;

    // ======================
    // 1. No-signal case → neutral, no punishment
    // ======================
    if (!hasAnyTagSignal) {
      totalWeightedScore += tagGrade * priorities.tags;
      totalAchievedWeight += priorities.tags; // treat as neutral, fully valid baseline
    } else {
      // ======================
      // 2. Preferred / Excluded logic
      // ======================
      const preferredAdjustment = preferredCount * tagModifiers.preferred;
      const excludedAdjustment = excludedCount * tagModifiers.excluded;

      tagGrade += preferredAdjustment;
      tagGrade += excludedAdjustment;

      // ======================
      // 3. Completion / version logic
      // ======================
      const hasCompleted = !!overlayMatches.completed;
      const hasHighVer = !!overlayMatches.highVersion;
      const hasInvalidVer = !!overlayMatches.invalidVersion;

      if (hasCompleted) {
        tagGrade += tagModifiers.completed;
      } else if (hasHighVer) {
        tagGrade += tagModifiers.highVersion;
      } else if (hasInvalidVer) {
        tagGrade += tagModifiers.invalidVersion;
      }

      // ======================
      // 4. Status flags
      // ======================
      if (overlayMatches.onhold) tagGrade += tagModifiers.onhold;
      if (overlayMatches.abandoned) tagGrade += tagModifiers.abandoned;

      const clampedTagGrade = Math.max(0, Math.min(1, tagGrade));

      totalWeightedScore += clampedTagGrade * priorities.tags;

      // ======================
      // 5. Achievement logic (softened)
      // ======================
      const hasHeavyPenalties = overlayMatches.onhold || overlayMatches.abandoned;

      if ((hasCompleted || hasHighVer || preferredCount > 0) && !hasHeavyPenalties) {
        totalAchievedWeight += priorities.tags;
      } else {
        totalAchievedWeight += priorities.tags * 0.7;
      }
    }
  }

  // ====================== FINAL CALCULATION ======================
  if (totalConfiguredWeight === 0) return 0;

  const baseScore = (totalWeightedScore / totalConfiguredWeight) * 10;
  const completeness = totalAchievedWeight / totalConfiguredWeight;

  // Final score with stronger emphasis on completeness
  let finalScore = baseScore * (0.45 + completeness * 0.55);

  finalScore = Math.max(0, Math.min(10, finalScore));

  debugLog("Score breakdown", {
    baseScore: baseScore.toFixed(2),
    completeness: completeness.toFixed(3),
    finalScore: finalScore.toFixed(1),
    configured: totalConfiguredWeight.toFixed(1),
    achieved: totalAchievedWeight.toFixed(1),
  });

  return parseFloat(finalScore.toFixed(1));
}

/**
 * Get CSS class for score display color
 * Green: 7+, Yellow: 4-6, Red: <4
 * @param {number} score - Tile score
 * @returns {string} CSS class name
 */
export function getScoreColorClass(score) {
  if (score >= 7) {
    return "tile-score-green";
  } else if (score >= 4) {
    return "tile-score-yellow";
  } else {
    return "tile-score-red";
  }
}

/**
 * Apply score display to tile (right side)
 * @param {Element} tile - The tile DOM element
 * @param {number} score - Tile score
 */
export function applyScoreDisplay(tile, score) {
  // Safety cutoff: if score is 0, completely skip rendering the element
  if (score === 0) {
    removeScoreDisplay(tile);
    return;
  }

  const thumbWrap = tile.querySelector(SELECTORS.TILE.THUMB_WRAP);
  if (!thumbWrap) return;

  // Remove existing score display
  const existingScore = thumbWrap.querySelector(".tile-score-display");
  if (existingScore) existingScore.remove();

  // Create score display
  const scoreDisplay = document.createElement("div");
  scoreDisplay.className = `tile-score-display ${getScoreColorClass(score)}`;
  scoreDisplay.textContent = score.toFixed(1); // Explicitly ensure standard 1 decimal readout

  thumbWrap.appendChild(scoreDisplay);
}

/**
 * Remove score display from tile
 * @param {Element} tile - The tile DOM element
 */
export function removeScoreDisplay(tile) {
  const scoreDisplay = tile.querySelector(".tile-score-display");
  if (scoreDisplay) scoreDisplay.remove();
}
