(() => {
  // -------------------------------------------------------------
  // FIXED CONSOLE EMERGENCY FALLBACKS (Using strict class matching)
  // -------------------------------------------------------------
  const parseMetricValue =
    window.parseMetricValue ||
    ((el) => {
      if (!el) return null;
      const txt = el.textContent.trim().toLowerCase();
      if (!txt) return null;
      let base = parseFloat(txt.replace(/[^0-9.]/g, ""));
      if (isNaN(base)) return null;
      if (txt.includes("k")) base *= 1000;
      if (txt.includes("m")) base *= 1000000;
      return Math.floor(base);
    });

  const extractDaysElapsed =
    window.extractDaysElapsed ||
    ((tile) => {
      // 1. Target using the same query selectors
      const timeContainer = tile.querySelector(".resource-tile_info-meta_time");
      if (!timeContainer) return null;

      // 2. Locate the structural data span
      const span = timeContainer.querySelector("span");
      if (!span) return null;

      // 3. Build resilient class/text context (handles singular/plural + date_yesterday)
      const text = span.textContent?.trim().toLowerCase() || "";
      const rawValue = parseInt(text, 10);
      const classTokens = Array.from(span.classList);
      const className = span.className || "";
      const hasClassFragment = (fragment) =>
        className.includes(fragment) || classTokens.some((token) => token.includes(fragment));
      const numericValue = Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 1;

      // 4. Special class cases
      if (hasClassFragment("date_yesterday")) return 1;
      if (hasClassFragment("date_today")) return 1;

      // 5. Unit classes (singular and plural)
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

      // 6. Text fallback for odd markup variants
      if (text.includes("yesterday")) return 1;
      if (text.includes("today") || text.includes("just now")) return 1;
      if (text.includes("hour") || text.includes("min")) return 1;
      if (text.includes("week")) return numericValue * 7;
      if (text.includes("month")) return numericValue * 30;
      if (text.includes("year")) return numericValue * 365;
      if (text.includes("day")) return numericValue;

      return Number.isFinite(rawValue) ? rawValue : null;
    });

  const calculateEngagementRatioTest =
    window.calculateEngagementRatioTest ||
    ((likes, views) => {
      if (!views) return 0;
      return parseFloat(((likes / views) * 100).toFixed(2));
    });

  const getEngagementHighlightClassTest =
    window.getEngagementHighlightClassTest ||
    ((ratio) => {
      if (ratio >= 4.0) return "engagement-ratio-green";
      if (ratio >= 1.5) return "engagement-ratio-yellow";
      return "engagement-ratio-red";
    });

  const threshold = window.threshold || 4.0;

  // -------------------------------------------------------------
  // CORE ANALYSIS RUNNER
  // -------------------------------------------------------------
  const RATING_ENGAGEMENT = {
    RATING: ".resource-tile_info-meta_rating",
    LIKES: ".resource-tile_info-meta_likes",
    VIEWS: ".resource-tile_info-meta_views",
    TIME: ".resource-tile_info-meta_time",
  };

  const tiles = Array.from(document.getElementsByClassName("resource-tile"));

  console.clear();
  console.log(
    `%c%c PAGE SNAPSHOT EVALUATOR: RUNNING %c`,
    "background:#111; color:#fff; padding:4px 0;",
    "background:#111; color:#00ffcc; font-size:13px; font-weight:bold; padding:4px 0;",
    "background:#111; color:#fff; padding:4px 0;",
  );

  if (tiles.length === 0) {
    console.error("No resource tiles discovered on this layout.");
    return;
  }

  const liveAuditMatrix = [];

  let totalViewsSum = 0;
  let totalDaysSum = 0;
  let validTileCount = 0;

  tiles.forEach((tile) => {
    const likesEl = tile.querySelector(RATING_ENGAGEMENT.LIKES);
    const viewsEl = tile.querySelector(RATING_ENGAGEMENT.VIEWS);

    const likes = parseMetricValue(likesEl);
    const views = parseMetricValue(viewsEl);

    // Pass the actual TILE container into the extractor, matching your source function
    const daysElapsed = extractDaysElapsed(tile);

    if (likes !== null && views !== null && views > 0 && daysElapsed !== null) {
      totalViewsSum += views;
      totalDaysSum += daysElapsed;
      validTileCount++;

      const calculatedRatio = calculateEngagementRatioTest(likes, views);
      const outputClass = getEngagementHighlightClassTest(calculatedRatio, threshold);
      const rawPct = ((likes / views) * 100).toFixed(2) + "%";

      liveAuditMatrix.push({
        "True Views": views.toLocaleString(),
        "True Likes": likes.toLocaleString(),
        "Days Elapsed": daysElapsed,
        "Raw Conversion %": rawPct,
        "Calculated Ratio Score": calculatedRatio,
        "Resulting Highlight Label": outputClass,
      });
    }
  });

  console.table(liveAuditMatrix);

  if (validTileCount > 0) {
    const averageViewsOnPage = Math.round(totalViewsSum / validTileCount);
    const averageDaysOnPage = (totalDaysSum / validTileCount).toFixed(1);

    console.log(
      `%c📈 PAGE METRICS ANALYSIS SUMMARY 📈\n` +
        `Validated Threads Evaluated: ${validTileCount}\n` +
        `Average View Count Across Tiles: ${averageViewsOnPage.toLocaleString()} views\n` +
        `Average Thread Age Across Tiles: ${averageDaysOnPage} days`,
      "background:#1a2a3a; color:#ffcc00; font-size:12px; font-weight:bold; padding:6px; line-height: 1.5;",
    );
  } else {
    console.warn("No active elements met the required validation filters.");
  }
})();
