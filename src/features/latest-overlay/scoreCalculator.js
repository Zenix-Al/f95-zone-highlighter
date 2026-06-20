import { config, defaultPriorityWeights, defaultTagModifiers } from "../../config.js";
import { SELECTORS } from "../../config/selectors.js";
import { LATEST_OVERLAY_SCORING } from "../../config/latestOverlayScoring.js";

/**
 * Score Calculator for Latest Overlay Tiles
 * Calculates a bounded 0-10 statistical rating using relative priority weights.
 * Displays on the right side of the tile
 */

/**
 * Calculates separate confidence multipliers for Rating and Engagement
 * @param {number} views - Raw total view count
 * @param {number} daysElapsed - Age of the thread in days
 * @param {string} pageCategory - Latest page category scope
 * @returns {{ ratingConfidence: number, engagementConfidence: number }}
 */
function normalizePageCategory(pageCategory) {
  return String(pageCategory || "games")
    .trim()
    .toLowerCase();
}

function getEngagementConfidenceFromProfile(viewsPerMonth, profile) {
  let engagementConfidence = profile.defaultEngagementConfidence;

  if (viewsPerMonth < profile.lowVelocityMaxViewsPerMonth) {
    engagementConfidence = profile.lowVelocityConfidence;
  } else if (viewsPerMonth < profile.nicheVelocityMaxViewsPerMonth) {
    engagementConfidence = profile.nicheVelocityConfidence;
  } else if (viewsPerMonth < profile.healthyVelocityMaxViewsPerMonth) {
    engagementConfidence = profile.healthyVelocityConfidence;
  }

  return engagementConfidence;
}

function getThreadConfidence(views, daysElapsed, pageCategory = "games") {
  const confidenceConfig = LATEST_OVERLAY_SCORING.scoreCalculator.threadConfidence;
  const normalizedCategory = normalizePageCategory(pageCategory);
  const isGameCategory = normalizedCategory === "games";

  // Safeguard days to prevent division by zero or negative time
  const days =
    !daysElapsed || daysElapsed < confidenceConfig.minDaysElapsed
      ? confidenceConfig.minDaysElapsed
      : daysElapsed;

  // -------------------------------------------------------------
  // 1. ENGAGEMENT CONFIDENCE: Driven by Current Velocity (Views / Day)
  // -------------------------------------------------------------
  const viewsPerMonth = (views / days) * confidenceConfig.viewsToMonthFactor;
  const gameProfile = {
    defaultEngagementConfidence: confidenceConfig.defaultEngagementConfidence,
    lowVelocityMaxViewsPerMonth: confidenceConfig.lowVelocityMaxViewsPerMonth,
    lowVelocityConfidence: confidenceConfig.lowVelocityConfidence,
    nicheVelocityMaxViewsPerMonth: confidenceConfig.nicheVelocityMaxViewsPerMonth,
    nicheVelocityConfidence: confidenceConfig.nicheVelocityConfidence,
    healthyVelocityMaxViewsPerMonth: confidenceConfig.healthyVelocityMaxViewsPerMonth,
    healthyVelocityConfidence: confidenceConfig.healthyVelocityConfidence,
  };

  let engagementConfidence = getEngagementConfidenceFromProfile(viewsPerMonth, gameProfile);

  if (!isGameCategory) {
    const nonGameProfiles = confidenceConfig.nonGameProfiles;
    const utilityCategories =
      nonGameProfiles && Array.isArray(nonGameProfiles.utilityCategories)
        ? nonGameProfiles.utilityCategories
        : [];
    const isUtilityCategory = utilityCategories.includes(normalizedCategory);

    const selectedProfile = isUtilityCategory
      ? nonGameProfiles?.utilityVelocityProfile
      : nonGameProfiles?.standardVelocityProfile;

    if (selectedProfile && typeof selectedProfile === "object") {
      engagementConfidence = getEngagementConfidenceFromProfile(viewsPerMonth, selectedProfile);
    }
  }

  // -------------------------------------------------------------
  // 2. RATING CONFIDENCE: To prevent an early thread from being judged too harshly before it has a chance to grow
  // we apply a time-based confidence modifier to the rating score.
  // -------------------------------------------------------------
  let ratingConfidence = confidenceConfig.defaultRatingConfidence;

  // 1. DAY 1 SLACK (Under 24 hours old)
  if (days <= confidenceConfig.dayOneMaxDays) {
    // If it has barely any views, do not trust the early rating yet
    if (views < confidenceConfig.dayOneLowViewsThreshold) {
      ratingConfidence = confidenceConfig.dayOneLowViewsConfidence;
    }
  } else if (days <= confidenceConfig.dayThreeMaxDays) {
    // Needs a slightly higher view count to drop the slack penalty
    if (views < confidenceConfig.dayThreeLowViewsThreshold) {
      ratingConfidence = confidenceConfig.dayThreeLowViewsConfidence;
    }
  }

  return {
    ratingConfidence,
    engagementConfidence,
  };
}

function getRatingGrade(ratingClass) {
  const gradeConfig = LATEST_OVERLAY_SCORING.scoreCalculator.ratingGrade;
  if (!ratingClass) return null;
  if (ratingClass.includes("green")) return gradeConfig.green;
  if (ratingClass.includes("yellow")) return gradeConfig.yellow;
  if (ratingClass.includes("red")) return gradeConfig.red;
  return null;
}

/**
 * Determine performance grade from engagement highlight
 * @param {string|null} engagementClass - CSS class from engagement highlight
 * @param {boolean} isGameCategory - True when current page scope is games
 * @returns {number|null} Normalized grade from 0.0 (worst) to 1.0 (best)
 */
function getEngagementGrade(engagementClass, isGameCategory) {
  if (!engagementClass) return null;
  const base = isGameCategory ? 0.75 : 1.0;
  if (engagementClass.includes("green")) return base;
  if (engagementClass.includes("yellow")) return base / 2;
  if (engagementClass.includes("red")) return 0;
  return null;
}

/**
 * Calculate tile score based on overlay status and highlights using a Statistical Matrix
 * @param {Object} overlayMatches - Matched overlays
 * @param {string|null} ratingClass - Rating highlight class
 * @param {string|null} engagementClass - Engagement highlight class
 * @param {number} preferredCount - Count of preferred tags
 * @param {number} excludedCount - Count of excluded tags
 * @param {number} views - Total views
 * @param {number} time - Thread age in days
 * @param {string} pageCategory - Latest page category (games, comics, etc.)
 * @returns {number} Score 0-10
 */
export function calculateTileScore(
  overlayMatches = {},
  ratingClass = null,
  engagementClass = null,
  preferredCount = 0,
  excludedCount = 0,
  views = 0,
  time = 1,
  pageCategory = "games",
) {
  const normalizedCategory = normalizePageCategory(pageCategory);
  const isGameCategory = normalizedCategory === "games";
  const isRatingCategory = normalizedCategory === "games" || normalizedCategory === "animations";

  const scoreConfig = LATEST_OVERLAY_SCORING.scoreCalculator;
  const priorities = config.latestSettings?.priorityWeights || defaultPriorityWeights;
  const tagModifiers = config.latestSettings?.tagModifiers || defaultTagModifiers;

  let totalWeightedScore = 0;
  let totalConfiguredWeight = 0;
  let totalAchievedWeight = 0;
  const nonGameWeightMultiplier = !isGameCategory
    ? scoreConfig.nonGameWeighting?.engagementWeightMultiplier || 1
    : 1.0;
  const threadConfidence = getThreadConfidence(views, time, normalizedCategory);

  // ====================== RATING PILLAR ======================
  if (config.overlaySettings?.ratingHighlight && isRatingCategory && priorities.rating > 0) {
    const ratingGrade = getRatingGrade(ratingClass);
    const ratingWeight =
      priorities.rating *
      Math.max(scoreConfig.weightFloors.pillarMinMultiplier, threadConfidence.ratingConfidence);

    if (ratingGrade !== null) {
      totalConfiguredWeight += ratingWeight;
      totalWeightedScore += ratingGrade * ratingWeight;

      if (ratingGrade >= scoreConfig.achievedThresholds.rating) {
        totalAchievedWeight += ratingWeight;
      }
    }
  }

  // ====================== ENGAGEMENT PILLAR ======================
  if (config.overlaySettings?.engagementHighlight && priorities.engagement > 0) {
    const engagementGrade = getEngagementGrade(engagementClass, isGameCategory);

    // Apply the multiplier exclusively to the engagement pillar weight for non-games
    const engagementWeight =
      priorities.engagement *
      nonGameWeightMultiplier *
      Math.max(scoreConfig.weightFloors.pillarMinMultiplier, threadConfidence.engagementConfidence);

    if (engagementGrade !== null) {
      totalConfiguredWeight += engagementWeight;
      totalWeightedScore += engagementGrade * engagementWeight;

      if (engagementGrade >= scoreConfig.achievedThresholds.engagement) {
        totalAchievedWeight += engagementWeight;
      }
    }
  }

  // ====================== TAGS PILLAR ======================
  if (priorities.tags > 0) {
    const hasTagConfig =
      (Array.isArray(config.preferredTags) && config.preferredTags.length > 0) ||
      (Array.isArray(config.excludedTags) && config.excludedTags.length > 0);

    // Status signals are strictly restricted to games
    const hasStatusSignal =
      isGameCategory &&
      (overlayMatches.completed ||
        overlayMatches.highVersion ||
        overlayMatches.invalidVersion ||
        overlayMatches.onhold ||
        overlayMatches.abandoned);

    const hasPreferenceSignal = hasTagConfig && (preferredCount > 0 || excludedCount > 0);
    const hasAnyTagSignal = hasPreferenceSignal || hasStatusSignal;

    // If user has no preferred/excluded config and no status signal exists,
    // skip tags pillar entirely so it cannot cap the final score.
    if (!hasTagConfig && !hasStatusSignal) {
      return finalizeScore(
        totalWeightedScore,
        totalConfiguredWeight,
        totalAchievedWeight,
        scoreConfig,
      );
    }

    totalConfiguredWeight += priorities.tags;

    let tagGrade = scoreConfig.tagGrade.neutralBaseline;
    // If there are no signals at all, we can either skip the pillar (if user has no tag config)
    // or give it a neutral baseline grade (if user has tag config, to allow for positive adjustments from preferred tags without penalty from lack of status signals)
    if (!hasAnyTagSignal) {
      totalWeightedScore += tagGrade * priorities.tags;
      totalAchievedWeight += priorities.tags;
      return finalizeScore(
        totalWeightedScore,
        totalConfiguredWeight,
        totalAchievedWeight,
        scoreConfig,
      );
    }

    // Preferred/excluded math is global (applies if user configured tags)
    const preferredAdjustment = hasTagConfig ? preferredCount * tagModifiers.preferred : 0;
    const excludedAdjustment = hasTagConfig ? excludedCount * tagModifiers.excluded : 0;

    tagGrade += preferredAdjustment;
    tagGrade += excludedAdjustment;

    // --- GAME ONLY MODIFIERS GATE ---
    let hasCompleted = false;
    let hasHighVer = false;
    let hasHeavyPenalties = false;

    if (isGameCategory) {
      hasCompleted = Boolean(overlayMatches.completed);
      hasHighVer = Boolean(overlayMatches.highVersion);
      const hasInvalidVer = Boolean(overlayMatches.invalidVersion);

      if (hasCompleted) {
        tagGrade += tagModifiers.completed;
      } else if (hasHighVer) {
        tagGrade += tagModifiers.highVersion;
      } else if (hasInvalidVer) {
        tagGrade += tagModifiers.invalidVersion;
      }

      if (overlayMatches.onhold) tagGrade += tagModifiers.onhold;
      if (overlayMatches.abandoned) tagGrade += tagModifiers.abandoned;

      hasHeavyPenalties = Boolean(overlayMatches.onhold || overlayMatches.abandoned);
    }
    // ---------------------------------

    const clampedTagGrade = Math.max(
      scoreConfig.tagGrade.min,
      Math.min(scoreConfig.tagGrade.max, tagGrade),
    );

    totalWeightedScore += clampedTagGrade * priorities.tags;

    // --- ACHIEVED WEIGHT DETERMINATION GATE ---
    if (isGameCategory) {
      // Games require progress statuses OR user preferred tags without holding back penalties
      if (
        (hasCompleted || hasHighVer || (hasTagConfig && preferredCount > 0)) &&
        !hasHeavyPenalties
      ) {
        totalAchievedWeight += priorities.tags;
      } else {
        totalAchievedWeight += priorities.tags * scoreConfig.tagGrade.partialAchievedRatio;
      }
    } else {
      // Non-games depend purely on whether the user matched their own configured preferences
      if (hasTagConfig && preferredCount > 0) {
        totalAchievedWeight += priorities.tags;
      } else {
        totalAchievedWeight += priorities.tags * scoreConfig.tagGrade.partialAchievedRatio;
      }
    }
    // ------------------------------------------
  }

  return finalizeScore(totalWeightedScore, totalConfiguredWeight, totalAchievedWeight, scoreConfig);
}

function finalizeScore(
  totalWeightedScore,
  totalConfiguredWeight,
  totalAchievedWeight,
  scoreConfig,
) {
  if (totalConfiguredWeight === 0) return 0;

  const baseScore = (totalWeightedScore / totalConfiguredWeight) * scoreConfig.finalScore.scale;
  const completeness = totalAchievedWeight / totalConfiguredWeight;

  let finalScore =
    baseScore *
    (scoreConfig.finalScore.completenessBase +
      completeness * scoreConfig.finalScore.completenessWeight);

  finalScore = Math.max(
    scoreConfig.finalScore.clampMin,
    Math.min(scoreConfig.finalScore.clampMax, finalScore),
  );

  return parseFloat(finalScore.toFixed(scoreConfig.finalScore.precision));
}

/**
 * Get CSS class for score display color
 * Green: 7+, Yellow: 4-6, Red: <4
 * @param {number} score - Tile score
 * @returns {string} CSS class name
 */
export function getScoreColorClass(score) {
  const colorThresholds = LATEST_OVERLAY_SCORING.scoreCalculator.colorThresholds;
  if (score >= colorThresholds.greenMin) {
    return "tile-score-green";
  } else if (score >= colorThresholds.yellowMin) {
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
  if (score === 0) {
    removeScoreDisplay(tile);
    return;
  }

  const thumbWrap = tile.querySelector(SELECTORS.TILE.THUMB_WRAP);
  if (!thumbWrap) return;

  const existingScore = thumbWrap.querySelector(".tile-score-display");
  if (existingScore) existingScore.remove();

  const scoreDisplay = document.createElement("div");
  scoreDisplay.className = `tile-score-display ${getScoreColorClass(score)}`;
  scoreDisplay.textContent = score.toFixed(
    LATEST_OVERLAY_SCORING.scoreCalculator.finalScore.precision,
  );

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
