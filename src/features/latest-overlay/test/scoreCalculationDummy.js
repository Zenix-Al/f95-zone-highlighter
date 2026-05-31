// ==================== v5 - Dynamically Configurable Engine ====================

// Simulated global configurations (mirrors your script structure)
const config = {
  overlaySettings: {
    ratingHighlight: true,
    engagementHighlight: true,
  },
  latestSettings: {
    priorityWeights: {
      rating: 2.5,
      engagement: 1.5,
      tags: 6.0, // Tags are explicitly dominant
    },
    tagModifiers: {
      preferred: 0.25, // Down from 0.45 to allow room for states
      completed: 0.25, // Down from 0.38
      highVersion: 0.12, // Down from 0.28
      incomplete: -0.05, // Toned down from -0.25 so raw baselines don't tank
      onhold: -0.15,
      abandoned: -0.35,
      excluded: -0.55,
    },
  },
};

// Mock logging hook
function debugLog(msg, data) {
  // Toggle to true if you want to inspect internal dictionaries
  if (false) console.log(`[DEBUG] ${msg}`, data);
}

function getRatingGrade(ratingClass) {
  if (!ratingClass) return null;
  if (ratingClass.includes("green")) return 1.0;
  if (ratingClass.includes("yellow")) return 0.5;
  if (ratingClass.includes("red")) return 0.0;
  return 0.5;
}

function getEngagementGrade(engagementClass) {
  if (!engagementClass) return null;
  if (engagementClass.includes("green")) return 1.0;
  if (engagementClass.includes("yellow")) return 0.6;
  if (engagementClass.includes("red")) return 0.1;
  return 0.5;
}

function calculateTileScore(
  overlayMatches = {},
  ratingClass = null,
  engagementClass = null,
  preferredCount = 0,
  excludedCount = 0,
) {
  console.groupCollapsed(
    `%cScore Calculation → Pref Count: ${preferredCount} | R: ${ratingClass ? ratingClass.split("-").pop() : "null"} | E: ${engagementClass ? engagementClass.split("-").pop() : "null"}`,
    "color:#ff69b4; font-weight:bold",
  );

  debugLog("Latest overlay score calculation", {
    engagementClass,
    ratingClass,
    preferredCount,
    excludedCount,
    overlayMatches,
  });

  const priorities = config.latestSettings?.priorityWeights || {
    rating: 3,
    engagement: 2,
    tags: 5,
  };

  const tagModifiers = config.latestSettings?.tagModifiers || {
    preferred: 0.3, // Down from 0.45
    completed: 0.2, // Down from 0.38
    highVersion: 0.1, // Down from 0.28
    incomplete: -0.15, // Up from -0.25
    onhold: -0.15,
    abandoned: -0.3,
    excluded: -0.4,
  };

  let totalWeightedScore = 0;
  let totalConfiguredWeight = 0;
  let totalAchievedWeight = 0;

  // ====================== RATING PILLAR ======================
  if (config.overlaySettings?.ratingHighlight && priorities.rating > 0) {
    const ratingGrade = getRatingGrade(ratingClass);
    totalConfiguredWeight += priorities.rating;

    if (ratingGrade != null) {
      totalWeightedScore += ratingGrade * priorities.rating;

      // Rating is strict and reliable → full achievement weight only on true green (1.0)
      if (ratingGrade >= 1.0) {
        totalAchievedWeight += priorities.rating;
      }
    }
  }

  // ====================== ENGAGEMENT PILLAR ======================
  if (config.overlaySettings?.engagementHighlight && priorities.engagement > 0) {
    const engagementGrade = getEngagementGrade(engagementClass);
    totalConfiguredWeight += priorities.engagement;

    if (engagementGrade != null) {
      totalWeightedScore += engagementGrade * priorities.engagement;

      // Engagement handicap factor → 0.6+ (Yellow/Green) safely counts towards achievement credit
      if (engagementGrade >= 0.6) {
        totalAchievedWeight += priorities.engagement;
      }
    }
  }

  // ====================== TAGS PILLAR (Respects Dynamic Configs) ======================
  if (priorities.tags > 0) {
    // Always add the absolute pillar weight directly to the pool to prevent mathematical imbalance
    totalConfiguredWeight += priorities.tags;

    let tagGrade = 0.5; // Start at mathematically balanced True Neutral

    // 1. Process Modifiers
    tagGrade += preferredCount * tagModifiers.preferred;
    tagGrade += excludedCount * tagModifiers.excluded; // Evaluates cleanly since exclusion is negative

    // 2. Structural Completion Logic
    const hasCompleted = !!overlayMatches.completed;
    const hasHighVer = !!overlayMatches.highVersion;

    if (hasCompleted) {
      tagGrade += tagModifiers.completed;
    } else if (hasHighVer) {
      tagGrade += tagModifiers.highVersion;
    } else {
      // Dynamic Penalty: Mirrors your configurable completed preference inversely if missing
      const incompletePenalty = tagModifiers.incomplete ?? -(tagModifiers.completed || 0.2);
      tagGrade += incompletePenalty;
    }

    // 3. Status/Context Flags
    if (overlayMatches.onhold) tagGrade += tagModifiers.onhold;
    if (overlayMatches.abandoned) tagGrade += tagModifiers.abandoned;

    // 4. Hard Bound Clamp
    const clampedTagGrade = Math.max(0, Math.min(1, tagGrade));
    totalWeightedScore += clampedTagGrade * priorities.tags;

    // 5. Dynamic Curation Goal Achievement
    // Treat the pillar as achieved if it's completed, high version, or has preferred items without heavy penalties
    const hasHeavyPenalties =
      overlayMatches.onhold || overlayMatches.abandoned || excludedCount > 0;
    if ((hasCompleted || hasHighVer || preferredCount > 0) && !hasHeavyPenalties) {
      totalAchievedWeight += priorities.tags;
    } else if (!hasCompleted && !hasHighVer && !hasHeavyPenalties) {
      // Pure neutral baseline gets partial achievement credit so it isn't heavily crushed
      totalAchievedWeight += priorities.tags * 0.5;
    }
  }

  // ====================== CRITICAL COMPENSATOR ======================
  if (totalConfiguredWeight === 0) {
    console.groupEnd();
    return 0;
  }

  const baseScore = (totalWeightedScore / totalConfiguredWeight) * 10;
  const completeness = totalAchievedWeight / totalConfiguredWeight;

  // Final distribution curves utilizing completeness metrics
  let finalScore = baseScore * (0.45 + completeness * 0.55);
  finalScore = Math.max(0, Math.min(10, finalScore));

  console.log(
    `%cFINAL → Base Score: ${baseScore.toFixed(2)} | Completeness: ${completeness.toFixed(3)} | Resulting Score: ${finalScore.toFixed(1)}`,
    "color:lime; font-weight:bold",
  );
  console.groupEnd();

  return parseFloat(finalScore.toFixed(1));
}

// ==================== RUN MATRIX SIMULATION ====================
function runScoreSimulationMatrix() {
  console.clear();
  console.log(
    "%c🔥 RUNNING MATRIX: CONF-DRIVEN BALANCED ENGINE 🔥",
    "background:#222; color:#00ffcc; font-size:16px; font-weight:bold; padding:4px;",
  );

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

  const tagScenarios = [
    { name: "Neutral Baseline (No Action tags)", matches: {}, pref: 0, exc: 0 },
    { name: "1 Preferred Only", matches: {}, pref: 1, exc: 0 },
    { name: "1 Preferred + Completed State", matches: { completed: true }, pref: 1, exc: 0 },
    { name: "1 Preferred + High Version State", matches: { highVersion: true }, pref: 1, exc: 0 },
    { name: "1 Preferred + OnHold Penalty", matches: { onhold: true }, pref: 1, exc: 0 },
    { name: "Explicitly Excluded Card", matches: {}, pref: 0, exc: 1 },
  ];

  const results = [];

  for (const tag of tagScenarios) {
    for (const r of ratingTiers) {
      for (const e of engagementTiers) {
        const score = calculateTileScore(tag.matches, r, e, tag.pref, tag.exc);
        results.push({
          "Tag Scenario": tag.name,
          "Thread Rating": r ? r.split("-").pop().toUpperCase() : "MISSING",
          "Engagement Metric": e ? e.split("-").pop().toUpperCase() : "MISSING",
          "Calculated Score": score,
        });
      }
    }
  }

  console.table(results);

  console.log(
    "%c🔍 AUDITING SPECIFIC PROBLEM CASE: 1 Preferred + Yellow Rating + Yellow Engagement",
    "background:#443300; color:#fff; padding: 4px 10px; font-weight:bold;",
  );
  // Testing the dynamic configuration verification case explicitly
  const verifiedWeak = calculateTileScore(
    {},
    "engagement-rating-yellow",
    "engagement-ratio-yellow",
    1,
    0,
  );
  console.log(
    `%cResult Output → **${verifiedWeak}**`,
    "color:#ffcc00; font-size:12px; font-weight:bold;",
  );
}

runScoreSimulationMatrix();
