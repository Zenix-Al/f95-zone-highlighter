import { config, STATUS } from "../config.js";

/**
 * Given a numeric tag ID, returns the STATUS it belongs to based on the user's
 * configured lists (preferred > excluded > marked), or null if unclassified.
 *
 * Used by both the latest-overlay hover handler and the thread overlay so the
 * priority logic lives in one place.
 *
 * @param {number} tagId
 * @returns {"preferred"|"excluded"|"marked"|null}
 */
export function resolveTagStatus(tagId) {
  const id = Number(tagId);
  if (!Number.isFinite(id)) return null;

  if ((config.preferredTags ?? []).some((x) => Number(x) === id)) return STATUS.PREFERRED;
  if ((config.excludedTags ?? []).some((x) => Number(x) === id)) return STATUS.EXCLUDED;
  if ((config.markedTags ?? []).some((x) => Number(x) === id)) return STATUS.MARKED;

  return null;
}
