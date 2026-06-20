// Dummy score simulator for latest overlay math validation.

const config = {
  preferredTags: [],
  excludedTags: [],
  overlaySettings: {
    ratingHighlight: true,
    engagementHighlight: true,
  },
  latestSettings: {
    priorityWeights: {
      rating: 2.5,
      engagement: 1.5,
      tags: 6.0,
    },
    tagModifiers: {
      preferred: 0.25,
      completed: 0.25,
      highVersion: 0.12,
      incomplete: -0.05,
      onhold: -0.15,
      abandoned: -0.35,
      excluded: -0.55,
      invalidVersion: 0.22,
    },
  },
};

const SIMULATION_CONFIG = {
  // null = full matrix
  // "ratingTiers" | "engagementTiers" | "viewScenarios" | "tagScenarios" | "pageCategories"
  focusDimension: "pageCategories",
  // Always fully loop these dimensions even when focusDimension is set.
  // Useful to surface rating/engagement behavior across categories.
  alwaysLoopDimensions: ["ratingTiers", "engagementTiers"],
  includeAllModes: false,
  inspectCase: {
    mode: "NoTagConfig",
    category: "games",
    tagScenario: "Neutral Baseline",
    traffic: "VIRAL BREAKOUT",
    rating: "GREEN",
    engagement: "GREEN",
  },
};

function normalizePageCategory(pageCategory) {
  return String(pageCategory || "games")
    .trim()
    .toLowerCase();
}

function getThreadConfidence(views, daysElapsed, pageCategory = "games") {
  const days = !daysElapsed || daysElapsed < 1 ? 1 : daysElapsed;
  const normalizedCategory = normalizePageCategory(pageCategory);
  const isGameCategory = normalizedCategory === "games";
  const viewsPerMonth = (views / days) * 30;
  let engagementConfidence = 1.0;
  if (viewsPerMonth < 2500) engagementConfidence = 0.0;
  else if (viewsPerMonth < 10000) engagementConfidence = 0.3;
  else if (viewsPerMonth < 30000) engagementConfidence = 0.7;

  if (!isGameCategory) {
    // Non-game categories generally have different traffic behavior than games.
    if (viewsPerMonth < 5000) engagementConfidence = 0.25;
    else if (viewsPerMonth < 18000) engagementConfidence = 0.55;
    else if (viewsPerMonth < 55000) engagementConfidence = 0.95;
    else engagementConfidence = 0.95;
  }

  let ratingConfidence = 1.0;
  if (days < 10) {
    if (views < 15000) ratingConfidence = 0.1;
    else if (views < 40000) ratingConfidence = 0.4;
    else ratingConfidence = 0.6;
  } else if (days <= 60) {
    if (views < 20000) ratingConfidence = 0.4;
    else ratingConfidence = 0.8;
  } else if (views < 15000) {
    ratingConfidence = 0.2;
  }

  return { ratingConfidence, engagementConfidence };
}

function getRatingGrade(ratingClass) {
  if (!ratingClass) return null;
  if (ratingClass.includes("green")) return 1.0;
  if (ratingClass.includes("yellow")) return 0.5;
  if (ratingClass.includes("red")) return 0.0;
  return null;
}

function getEngagementGrade(engagementClass, isGameCategory) {
  if (!engagementClass) return null;
  let base = isGameCategory ? 0.75 : 1.0;
  if (engagementClass.includes("green")) {
    // Games are strict (0.75). Non-games are trusted more (1.0).
    return base;
  }
  if (engagementClass.includes("yellow")) return base / 2;
  if (engagementClass.includes("red")) return 0;
  return null;
}

function finalizeScoreBreakdown(totalWeightedScore, totalConfiguredWeight, totalAchievedWeight) {
  if (totalConfiguredWeight === 0) {
    return {
      score: 0,
      baseScore: 0,
      completeness: 0,
      completenessMultiplier: 0.45,
      weightedTotal: 0,
      configured: 0,
      achieved: 0,
    };
  }

  const baseScore = (totalWeightedScore / totalConfiguredWeight) * 10;
  const completeness = totalAchievedWeight / totalConfiguredWeight;
  const completenessMultiplier = 0.45 + completeness * 0.55;
  let finalScore = baseScore * completenessMultiplier;
  finalScore = Math.max(0, Math.min(10, finalScore));

  return {
    score: parseFloat(finalScore.toFixed(1)),
    baseScore: parseFloat(baseScore.toFixed(2)),
    completeness: parseFloat(completeness.toFixed(3)),
    completenessMultiplier: parseFloat(completenessMultiplier.toFixed(3)),
    weightedTotal: parseFloat(totalWeightedScore.toFixed(3)),
    configured: parseFloat(totalConfiguredWeight.toFixed(1)),
    achieved: parseFloat(totalAchievedWeight.toFixed(1)),
  };
}

function calculateTileScoreDetailed(
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
  const priorities = config.latestSettings?.priorityWeights || {
    rating: 2.5,
    engagement: 1.5,
    tags: 6.0,
  };

  const tagModifiers = config.latestSettings?.tagModifiers || {
    preferred: 0.25,
    completed: 0.25,
    highVersion: 0.12,
    incomplete: -0.12,
    onhold: -0.2,
    abandoned: -0.4,
    excluded: -0.55,
    invalidVersion: 0.22,
  };

  let totalWeightedScore = 0;
  let totalConfiguredWeight = 0;
  let totalAchievedWeight = 0;
  const breakdown = {
    rating: {
      included: false,
      grade: null,
      weight: 0,
      weighted: 0,
      achieved: 0,
    },
    engagement: {
      included: false,
      grade: null,
      weight: 0,
      weighted: 0,
      achieved: 0,
    },
    tags: {
      included: false,
      hasTagConfig: false,
      hasStatusSignal: false,
      hasAnyTagSignal: false,
      weight: 0,
      grade: null,
      weighted: 0,
      achieved: 0,
    },
  };

  const threadConfidence = getThreadConfidence(views, time, normalizedCategory);

  // Rating pillar
  if (config.overlaySettings?.ratingHighlight && isRatingCategory && priorities.rating > 0) {
    breakdown.rating.included = true;
    const ratingGrade = getRatingGrade(ratingClass);
    const ratingWeight = priorities.rating * Math.max(0.1, threadConfidence.ratingConfidence);
    breakdown.rating.weight = parseFloat(ratingWeight.toFixed(3));

    if (ratingGrade !== null) {
      breakdown.rating.grade = ratingGrade;
      totalConfiguredWeight += ratingWeight;
      const weighted = ratingGrade * ratingWeight;
      totalWeightedScore += weighted;
      breakdown.rating.weighted = parseFloat(weighted.toFixed(3));

      if (ratingGrade >= 1.0) {
        totalAchievedWeight += ratingWeight;
        breakdown.rating.achieved = parseFloat(ratingWeight.toFixed(3));
      }
    }
  }

  // Engagement pillar
  if (config.overlaySettings?.engagementHighlight && priorities.engagement > 0) {
    breakdown.engagement.included = true;
    const engagementGrade = getEngagementGrade(engagementClass, isGameCategory);
    const engagementWeight =
      priorities.engagement * Math.max(0.1, threadConfidence.engagementConfidence);
    breakdown.engagement.weight = parseFloat(engagementWeight.toFixed(3));

    if (engagementGrade !== null) {
      breakdown.engagement.grade = engagementGrade;
      totalConfiguredWeight += engagementWeight;
      const weighted = engagementGrade * engagementWeight;
      totalWeightedScore += weighted;
      breakdown.engagement.weighted = parseFloat(weighted.toFixed(3));

      if (engagementGrade >= 0.7) {
        totalAchievedWeight += engagementWeight;
        breakdown.engagement.achieved = parseFloat(engagementWeight.toFixed(3));
      }
    }
  }

  // Tags pillar (fixed logic)
  if (priorities.tags > 0) {
    const hasTagConfig =
      (Array.isArray(config.preferredTags) && config.preferredTags.length > 0) ||
      (Array.isArray(config.excludedTags) && config.excludedTags.length > 0);

    const hasStatusSignal =
      isGameCategory &&
      (overlayMatches.completed ||
        overlayMatches.highVersion ||
        overlayMatches.invalidVersion ||
        overlayMatches.onhold ||
        overlayMatches.abandoned);

    const hasPreferenceSignal = hasTagConfig && (preferredCount > 0 || excludedCount > 0);
    const hasAnyTagSignal = hasPreferenceSignal || hasStatusSignal;
    breakdown.tags.hasTagConfig = hasTagConfig;
    breakdown.tags.hasStatusSignal = hasStatusSignal;
    breakdown.tags.hasAnyTagSignal = hasAnyTagSignal;

    // Only include tags pillar if user configured tag lists OR status signals exist.
    if (hasTagConfig || hasStatusSignal) {
      breakdown.tags.included = true;
      totalConfiguredWeight += priorities.tags;
      breakdown.tags.weight = parseFloat(priorities.tags.toFixed(3));

      let tagGrade = 0.5;

      if (!hasAnyTagSignal) {
        const weighted = tagGrade * priorities.tags;
        totalWeightedScore += weighted;
        totalAchievedWeight += priorities.tags;
        breakdown.tags.grade = parseFloat(tagGrade.toFixed(3));
        breakdown.tags.weighted = parseFloat(weighted.toFixed(3));
        breakdown.tags.achieved = parseFloat(priorities.tags.toFixed(3));
      } else {
        const preferredAdjustment = hasTagConfig ? preferredCount * tagModifiers.preferred : 0;
        const excludedAdjustment = hasTagConfig ? excludedCount * tagModifiers.excluded : 0;
        tagGrade += preferredAdjustment;
        tagGrade += excludedAdjustment;

        const hasCompleted = isGameCategory && Boolean(overlayMatches.completed);
        const hasHighVer = isGameCategory && Boolean(overlayMatches.highVersion);
        const hasInvalidVer = isGameCategory && Boolean(overlayMatches.invalidVersion);

        if (hasCompleted) tagGrade += tagModifiers.completed;
        else if (hasHighVer) tagGrade += tagModifiers.highVersion;
        else if (hasInvalidVer) tagGrade += tagModifiers.invalidVersion;

        if (isGameCategory && overlayMatches.onhold) tagGrade += tagModifiers.onhold;
        if (isGameCategory && overlayMatches.abandoned) tagGrade += tagModifiers.abandoned;

        const clampedTagGrade = Math.max(0, Math.min(1, tagGrade));
        const weighted = clampedTagGrade * priorities.tags;
        totalWeightedScore += weighted;
        breakdown.tags.grade = parseFloat(clampedTagGrade.toFixed(3));
        breakdown.tags.weighted = parseFloat(weighted.toFixed(3));

        const hasHeavyPenalties =
          isGameCategory && (overlayMatches.onhold || overlayMatches.abandoned);
        if (
          (hasCompleted || hasHighVer || (hasTagConfig && preferredCount > 0)) &&
          !hasHeavyPenalties
        ) {
          totalAchievedWeight += priorities.tags;
          breakdown.tags.achieved = parseFloat(priorities.tags.toFixed(3));
        } else {
          const achieved = priorities.tags * 0.7;
          totalAchievedWeight += achieved;
          breakdown.tags.achieved = parseFloat(achieved.toFixed(3));
        }
      }
    }
  }

  const final = finalizeScoreBreakdown(
    totalWeightedScore,
    totalConfiguredWeight,
    totalAchievedWeight,
  );
  return {
    ...final,
    breakdown,
  };
}

function calculateTileScore(
  overlayMatches = {},
  ratingClass = null,
  engagementClass = null,
  preferredCount = 0,
  excludedCount = 0,
  views = 0,
  time = 1,
  pageCategory = "games",
) {
  return calculateTileScoreDetailed(
    overlayMatches,
    ratingClass,
    engagementClass,
    preferredCount,
    excludedCount,
    views,
    time,
    pageCategory,
  ).score;
}

function runScoreSimulationMatrix() {
  console.clear();
  console.log("=== RUNNING SCORE MATRIX (with and without tag config) ===");

  const ratingTiers = [
    "engagement-rating-green",
    "engagement-rating-yellow",
    "engagement-rating-red",
    null,
  ];

  const engagementTiers = [
    "engagement-ratio-green",
    "engagement-ratio-yellow",
    "engagement-ratio-red",
    null,
  ];

  const viewScenarios = [
    { label: "VIRAL BREAKOUT", count: 25000, days: 3 },
    { label: "STEADY TRACKING", count: 55000, days: 45 },
    { label: "SLOW GROWER", count: 35000, days: 180 },
    { label: "GHOST TOWN", count: 50000, days: 730 },
  ];

  const tagScenarios = [
    { name: "Neutral Baseline", matches: {}, pref: 0, exc: 0 },
    { name: "Completed Only", matches: { completed: true }, pref: 0, exc: 0 },
    { name: "HighVersion Only", matches: { highVersion: true }, pref: 0, exc: 0 },
    { name: "OnHold Only", matches: { onhold: true }, pref: 0, exc: 0 },
    { name: "1 Preferred Only", matches: {}, pref: 1, exc: 0 },
    { name: "1 Preferred + Completed", matches: { completed: true }, pref: 1, exc: 0 },
    { name: "1 Preferred + HighVersion", matches: { highVersion: true }, pref: 1, exc: 0 },
    { name: "1 Preferred + OnHold", matches: { onhold: true }, pref: 1, exc: 0 },
    { name: "Explicitly Excluded", matches: {}, pref: 0, exc: 1 },
  ];

  const configModes = [
    { name: "NoTagConfig", preferredTags: [], excludedTags: [] },
    { name: "HasTagConfig", preferredTags: ["sandbox"], excludedTags: ["blocked"] },
  ];
  const pageCategories = ["games", "animations", "comics", "assets", "mods"];

  const pickLoopValues = (dimensionName, values) => {
    const alwaysLoop =
      Array.isArray(SIMULATION_CONFIG.alwaysLoopDimensions) &&
      SIMULATION_CONFIG.alwaysLoopDimensions.includes(dimensionName);
    if (alwaysLoop) return values;

    if (!SIMULATION_CONFIG.focusDimension) return values;
    if (SIMULATION_CONFIG.focusDimension === dimensionName) return values;
    return values.slice(0, 1);
  };

  const modeValues = SIMULATION_CONFIG.includeAllModes ? configModes : configModes.slice(0, 1);
  const ratingValues = pickLoopValues("ratingTiers", ratingTiers);
  const engagementValues = pickLoopValues("engagementTiers", engagementTiers);
  const viewValues = pickLoopValues("viewScenarios", viewScenarios);
  const tagValues = pickLoopValues("tagScenarios", tagScenarios);
  const categoryValues = pickLoopValues("pageCategories", pageCategories);

  const results = [];

  for (const mode of modeValues) {
    config.preferredTags = [...mode.preferredTags];
    config.excludedTags = [...mode.excludedTags];

    for (const category of categoryValues) {
      for (const tag of tagValues) {
        for (const v of viewValues) {
          for (const r of ratingValues) {
            for (const e of engagementValues) {
              const detail = calculateTileScoreDetailed(
                tag.matches,
                r,
                e,
                tag.pref,
                tag.exc,
                v.count,
                v.days,
                category,
              );
              const score = detail.score;
              const hasTagConfig = mode.preferredTags.length > 0 || mode.excludedTags.length > 0;
              const statusFlags = [
                tag.matches.completed ? "completed" : "",
                tag.matches.highVersion ? "highVersion" : "",
                tag.matches.invalidVersion ? "invalidVersion" : "",
                tag.matches.onhold ? "onhold" : "",
                tag.matches.abandoned ? "abandoned" : "",
              ]
                .filter(Boolean)
                .join(",");
              const prefApplied = hasTagConfig ? tag.pref : 0;
              const excApplied = hasTagConfig ? tag.exc : 0;
              const isRatingCategory = category === "games" || category === "animations";
              const gameStatusApplied = category === "games" ? statusFlags || "none" : "ignored";

              results.push({
                Mode: mode.name,
                Category: category,
                RatingAllowed: isRatingCategory ? "yes" : "no",
                TagScenario: tag.name,
                Traffic: v.label,
                Days: v.days,
                Rating: r ? r.split("-").pop().toUpperCase() : "MISSING",
                Engagement: e ? e.split("-").pop().toUpperCase() : "MISSING",
                PrefIn: tag.pref,
                ExclIn: tag.exc,
                PrefApplied: prefApplied,
                ExclApplied: excApplied,
                StatusFlags: statusFlags || "none",
                GameStatusApplied: gameStatusApplied,
                BaseScore: detail.baseScore,
                Completeness: detail.completeness,
                CompletenessMultiplier: detail.completenessMultiplier,
                WeightedTotal: detail.weightedTotal,
                ConfiguredWeight: detail.configured,
                AchievedWeight: detail.achieved,
                RatingGradeUsed: detail.breakdown.rating.grade,
                RatingWeight: detail.breakdown.rating.weight,
                RatingWeighted: detail.breakdown.rating.weighted,
                EngagementGradeUsed: detail.breakdown.engagement.grade,
                EngagementWeight: detail.breakdown.engagement.weight,
                EngagementWeighted: detail.breakdown.engagement.weighted,
                TagsUsed: detail.breakdown.tags.included ? "yes" : "no",
                TagsWeight: detail.breakdown.tags.weight,
                TagsGrade: detail.breakdown.tags.grade,
                TagsWeighted: detail.breakdown.tags.weighted,
                ScoreMath: "(WeightedTotal/ConfiguredWeight*10) * CompletenessMultiplier",
                Score: score,
              });
            }
          }
        }
      }
    }
  }
  console.log(
    `Rows: ${results.length} | focusDimension: ${SIMULATION_CONFIG.focusDimension || "none"} | includeAllModes: ${SIMULATION_CONFIG.includeAllModes}`,
  );
  console.table(results);

  const inspectCase = SIMULATION_CONFIG.inspectCase;
  if (inspectCase) {
    const inspectedRows = results.filter((row) => {
      if (inspectCase.mode && row.Mode !== inspectCase.mode) return false;
      if (inspectCase.category && row.Category !== inspectCase.category) return false;
      if (inspectCase.tagScenario && row.TagScenario !== inspectCase.tagScenario) return false;
      if (inspectCase.traffic && row.Traffic !== inspectCase.traffic) return false;
      if (inspectCase.rating && row.Rating !== inspectCase.rating) return false;
      if (inspectCase.engagement && row.Engagement !== inspectCase.engagement) return false;
      return true;
    });

    console.log("=== Score explain row(s) ===");
    console.table(
      inspectedRows.map((row) => ({
        Mode: row.Mode,
        Category: row.Category,
        Rating: row.Rating,
        Engagement: row.Engagement,
        WeightedTotal: row.WeightedTotal,
        ConfiguredWeight: row.ConfiguredWeight,
        BaseScore: row.BaseScore,
        Completeness: row.Completeness,
        CompletenessMultiplier: row.CompletenessMultiplier,
        Score: row.Score,
        RatingWeight: row.RatingWeight,
        RatingWeighted: row.RatingWeighted,
        EngagementWeight: row.EngagementWeight,
        EngagementWeighted: row.EngagementWeighted,
        TagsWeight: row.TagsWeight,
        TagsWeighted: row.TagsWeighted,
      })),
    );
  }

  const ratingClass = "engagement-rating-yellow";
  const engagementClass = "engagement-ratio-yellow";
  const views = 55000;
  const days = 45;

  const sanityRows = [];
  for (const category of pageCategories) {
    config.preferredTags = [];
    config.excludedTags = [];
    const noTagNoStatus = calculateTileScore(
      {},
      ratingClass,
      engagementClass,
      0,
      0,
      views,
      days,
      category,
    );

    config.preferredTags = ["sandbox"];
    config.excludedTags = [];
    const hasTagConfigNoStatus = calculateTileScore(
      {},
      ratingClass,
      engagementClass,
      0,
      0,
      views,
      days,
      category,
    );

    config.preferredTags = [];
    config.excludedTags = [];
    const noTagWithStatus = calculateTileScore(
      { completed: true },
      ratingClass,
      engagementClass,
      0,
      0,
      views,
      days,
      category,
    );

    sanityRows.push({
      Category: category,
      NoTag_NoStatus: noTagNoStatus,
      HasTagConfig_NoStatus: hasTagConfigNoStatus,
      NoTag_WithCompletedStatus: noTagWithStatus,
    });
  }

  console.log("=== Focused sanity checks ===");
  console.table(sanityRows);
}

runScoreSimulationMatrix();
