(() => {
  const threshold = 50;

  /**
   * Helper utility to safely convert platform shorthand strings (e.g., "12.7K", "1.2M", "1,500")
   * into clean, floating-point numeric values.
   */
  function parseMetricValue(element) {
    if (!element) return null;
    // Strip commas and force uppercase for robust suffix checking
    let text = element.textContent?.trim().replace(/,/g, "").toUpperCase() || "";
    if (!text || text === "-") return null;

    if (text.endsWith("K")) {
      return parseFloat(text) * 1000;
    }
    if (text.endsWith("M")) {
      return parseFloat(text) * 1000000;
    }

    const parsed = parseFloat(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * FIXED BOUNDED ENGAGEMENT CURVE
   * Converts raw percentage to a 0-100 base, then appends a volume-based grace factor.
   */
  /**
   * CALIBRATED DUAL-LOGARITHMIC ENGAGEMENT ENGINE
   * Hand-tuned specifically for forum index data distributions.
   * Stretches out highly viewed threads to allow high performance to hit GREEN (>50)
   * while safely dropping low-performing threads below the thresholds.
   */
  /**
   * BRACKET-AWARE ENGAGEMENT SCALE ENGINE
   * Intentionally isolates and balances ultra-high traffic brackets
   * to protect legacy favorites while maintaining the solid low-to-mid accuracy.
   */
  function calculateEngagementRatioTest(likes, views) {
    if (!Number.isFinite(likes) || !Number.isFinite(views) || views <= 0 || likes <= 0) {
      return null;
    }

    // 1. Core Conversion Value (Scaled up for calculation clarity)
    const basePct = (likes / views) * 100;

    // 2. Bracket-Aware Multiplier Assignment
    // Dynamically expands metrics to match target platform tiers based on total traffic scale.
    let bracketMultiplier;
    let flatBonus = 0;

    if (views >= 20000000) {
      // Ultra-Massive Tier (20M+ Views): High lurker dilution protection
      bracketMultiplier = 3800;
      flatBonus = 22; // Elevates the floor for verified large community hubs
    } else if (views >= 1000000) {
      // Mega Tier (1M to 20M Views)
      bracketMultiplier = 1200;
      flatBonus = 12;
    } else if (views >= 100000) {
      // Standard Hot Tier (100K to 1M Views)
      bracketMultiplier = 600;
      flatBonus = 5;
    } else {
      // Fresh/Low Volume Tier (Below 100K Views)
      bracketMultiplier = 180;
      // Low volume floor protection to match successful Log 1 metrics
      flatBonus = (100000 - views) / 2200;
    }

    // 3. Compute final adjusted matrix score
    const finalScore = basePct * bracketMultiplier + flatBonus;

    // Clamped firmly to fit neatly into your standard config max boundaries
    return parseFloat(Math.min(Math.max(finalScore, 0), 100).toFixed(2));
  }

  function getEngagementHighlightClassTest(ratio, threshold) {
    if (!Number.isFinite(ratio) || !Number.isFinite(threshold) || threshold <= 0) {
      return "NULL_DATA";
    }
    const halfThreshold = threshold / 2;
    if (ratio > threshold) return "GREEN";
    if (ratio > halfThreshold) return "YELLOW";
    return "RED";
  }

  const tiles = Array.from(document.getElementsByClassName("resource-tile"));

  console.clear();
  console.log(
    `%c📊 LIVE SCOPE RUN: PROCESSING ${tiles.length} ELEMENTS ON PAGE 📊`,
    "background:#111; color:#00ffcc; font-size:13px; font-weight:bold; padding:4px;",
  );

  if (tiles.length === 0) {
    console.error("No resource tiles found.");
    return;
  }

  const liveAuditMatrix = [];

  tiles.forEach((tile) => {
    // Target the inner data containers matching your active selectors
    const likesEl = tile.querySelector('.resource-tile_info-meta_likes, .likes, [class*="likes"]');
    const viewsEl = tile.querySelector('.resource-tile_info-meta_views, .views, [class*="views"]');

    const likes = parseMetricValue(likesEl);
    const views = parseMetricValue(viewsEl);

    if (likes !== null && views !== null && views > 0) {
      const calculatedRatio = calculateEngagementRatioTest(likes, views);
      const outputClass = getEngagementHighlightClassTest(calculatedRatio, threshold);
      const rawPct = ((likes / views) * 100).toFixed(2) + "%";

      liveAuditMatrix.push({
        "True Views": views.toLocaleString(),
        "True Likes": likes.toLocaleString(),
        "Raw Conversion %": rawPct,
        "Calculated Ratio Score": calculatedRatio,
        "Config Threshold": threshold,
        "Resulting Highlight Label": outputClass,
      });
    }
  });

  console.table(liveAuditMatrix);
})();
