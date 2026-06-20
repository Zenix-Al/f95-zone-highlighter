import { getRecordHighlightClasses } from "./ratingEngagementHighlight.js";
import { resolvePrefixStatuses } from "./overlayCache.js";

export function createTileState(tile, record, capturedAt, pageCategory = "games") {
  if (!tile || !record) return null;
  const highlights = getRecordHighlightClasses(record, capturedAt, pageCategory);

  return {
    element: tile,
    wasModified: tile.dataset.modified === "true",
    isConnected: tile.isConnected,
    pageCategory,
    threadId: record.thread_id,
    tags: record.tags,
    statuses: resolvePrefixStatuses(record.prefixes),
    versionText: String(record.version || "").toLowerCase().trim(),
    ratingClass: highlights.ratingClass,
    engagementClass: highlights.engagementClass,
    views: highlights.views,
    time: highlights.time,
  };
}
