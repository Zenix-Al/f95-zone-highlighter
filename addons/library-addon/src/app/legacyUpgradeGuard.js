import {
  LIBRARY_LEGACY_KEY,
  LIBRARY_MIGRATION_MARKER_KEY,
  LIBRARY_MINIMUM_BRIDGE_VERSION,
} from "../constants.js";
import { ensureLibrarySchema } from "../api/library/index.js";

function hasRecords(value) {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}

export async function detectLegacyUpgradeState(storage) {
  const [marker, legacy] = await Promise.all([
    storage.get(LIBRARY_MIGRATION_MARKER_KEY, false),
    storage.get(LIBRARY_LEGACY_KEY, null),
  ]);
  if (hasRecords(legacy)) {
    return {
      ok: false,
      reason: "upgrade_required",
      bridgeVersion: LIBRARY_MINIMUM_BRIDGE_VERSION,
      markerPresent: marker === true,
    };
  }
  return {
    ok: true,
    state: marker === true ? "supported_bridge" : "fresh",
    bridgeVersion: LIBRARY_MINIMUM_BRIDGE_VERSION,
  };
}

export function getLegacyUpgradeMessage() {
  return `upgrade_required: Your existing Library data was not modified. Install and open Library add-on v${LIBRARY_MINIMUM_BRIDGE_VERSION} once, then return to this version.`;
}

export async function prepareLibraryStorage({ core, storage, runPinnedIndexMigration }) {
  const legacyState = await detectLegacyUpgradeState(storage);
  if (!legacyState.ok) return legacyState;
  await ensureLibrarySchema(core);
  const pinnedMigration = await runPinnedIndexMigration();
  if (!pinnedMigration?.ok) {
    throw new Error(pinnedMigration?.reason || "pin_index_migration_failed");
  }
  if (legacyState.state === "fresh") {
    await storage.set(LIBRARY_MIGRATION_MARKER_KEY, true);
  }
  return legacyState;
}
