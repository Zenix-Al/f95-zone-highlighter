import { stateManager, config } from "../config.js";
import { ensurePageBridge, requestPageBridge } from "../core/pageBridge.js";
import { runFrameBudgeted } from "../core/frameBudget.js";
import { renderList } from "../ui/components/tag-search";

import { checkTags } from "./safetyService";
import { saveConfigKeys } from "./settingsService";
import {
  normalizePrefixesFromLatestUpdatesBudgeted,
  updatePrefixes,
} from "./prefixService.js";
import { debugLog } from "../core/logger";

const LATEST_CATALOG_BRIDGE_REQUEST_EVENT = "f95ue:latest-catalog-request";
const LATEST_CATALOG_BRIDGE_RESULT_EVENT = "f95ue:latest-catalog-result";
const LATEST_CATALOG_BRIDGE_MARKER = "f95ue_latest_catalog_bridge_installed";

export function updateSearch(event) {
  checkTags(); // Ensure warning is visible if tags are missing
  const query = event.target.value.trim().toLowerCase();
  const results = stateManager.get("shadowRoot").getElementById("search-results");

  if (!results) return;

  // If the input is empty, behave like focus: show the full tag list.
  if (!query) {
    showAllTags();
    return;
  }

  const filteredTags = config.tags.filter((tag) => tag.name.toLowerCase().includes(query));

  renderList(filteredTags);
}
export function showAllTags() {
  checkTags(); // Ensure warning is visible if tags are missing
  const results = stateManager.get("shadowRoot").getElementById("search-results");
  if (!results) return;
  renderList(config.tags);
  results.style.display = "block";
}

function toTagsOrderString(tags) {
  return JSON.stringify(
    (Array.isArray(tags) ? tags : []).map((tag) => ({
      id: Number(tag?.id),
      name: String(tag?.name || ""),
    })),
  );
}

async function normalizeTagsFromLatestUpdatesBudgeted(rawTags) {
  if (!rawTags) return [];

  const entries = Array.isArray(rawTags) ? rawTags : Object.entries(rawTags);
  const tagById = new Map();
  await runFrameBudgeted(
    entries,
    (entry) => {
      let idRaw;
      let nameRaw;
      if (Array.isArray(entry)) {
        [idRaw, nameRaw] = entry;
      } else if (entry && typeof entry === "object") {
        idRaw = entry.id;
        nameRaw = entry.name;
      }

      const id = Number(idRaw);
      const name = String(nameRaw || "").trim();
      if (Number.isFinite(id) && name && !tagById.has(id)) tagById.set(id, { id, name });
    },
    { budgetMs: 4, minChunk: 50 },
  );

  return [...tagById.values()].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    if (byName !== 0) return byName;
    return a.id - b.id;
  });
}

function ensureLatestCatalogPageBridge() {
  return ensurePageBridge({
    marker: LATEST_CATALOG_BRIDGE_MARKER,
    scriptContent: `
    (() => {
      if (window.__f95ueLatestCatalogBridgeInstalled) return;
      window.__f95ueLatestCatalogBridgeInstalled = true;

      window.addEventListener("${LATEST_CATALOG_BRIDGE_REQUEST_EVENT}", () => {
        const detail = { tags: null, prefixes: null, reasons: {} };

        try {
          const latest = window.latestUpdates;
          detail.tags = latest && latest.tags;
          detail.prefixes = latest && latest.prefixes;
          if (!detail.tags) detail.reasons.tags = "latest_updates_missing_tags";
          if (!detail.prefixes) detail.reasons.prefixes = "latest_updates_missing_prefixes";
        } catch (error) {
          const reason = error?.message ? String(error.message) : "latest_updates_read_throw";
          detail.reasons.tags = reason;
          detail.reasons.prefixes = reason;
        }

        try {
          window.dispatchEvent(
            new CustomEvent("${LATEST_CATALOG_BRIDGE_RESULT_EVENT}", { detail }),
          );
        } catch {}
      });
    })();
  `,
  });
}

function readLatestCatalogFromWindow() {
  try {
    return typeof window !== "undefined" ? window.latestUpdates || {} : {};
  } catch {
    return {};
  }
}

async function readLatestCatalogViaPageBridge(timeoutMs = 1200) {
  const bridgeReady = ensureLatestCatalogPageBridge();
  if (!bridgeReady) {
    return { tags: null, prefixes: null, reasons: { tags: "bridge_inject_failed", prefixes: "bridge_inject_failed" } };
  }

  const result = await requestPageBridge({
    requestEvent: LATEST_CATALOG_BRIDGE_REQUEST_EVENT,
    resultEvent: LATEST_CATALOG_BRIDGE_RESULT_EVENT,
    timeoutMs,
  });
  if (result.received) return result.detail || {};
  const reason = result.reason || "bridge_timeout";
  return { tags: null, prefixes: null, reasons: { tags: reason, prefixes: reason } };
}

async function readLatestCatalogs() {
  const direct = readLatestCatalogFromWindow();
  let [tags, prefixes] = await Promise.all([
    normalizeTagsFromLatestUpdatesBudgeted(direct.tags),
    normalizePrefixesFromLatestUpdatesBudgeted(direct.prefixes),
  ]);
  const directTagsValid = tags.length > 0;
  const directPrefixesValid = prefixes.items.length > 0;
  let bridge = null;
  if (!directTagsValid || !directPrefixesValid) {
    bridge = await readLatestCatalogViaPageBridge();
    const normalized = await Promise.all([
      tags.length ? tags : normalizeTagsFromLatestUpdatesBudgeted(bridge.tags),
      prefixes.items.length ? prefixes : normalizePrefixesFromLatestUpdatesBudgeted(bridge.prefixes),
    ]);
    [tags, prefixes] = normalized;
  }
  return {
    tags: {
      tags,
      source: directTagsValid ? "window" : "pageBridge",
      reason: tags.length ? "" : bridge ? bridge.reasons?.tags || "" : "window_empty",
    },
    prefixes: {
      prefixes,
      source: directPrefixesValid ? "window" : "pageBridge",
      reason: prefixes.items.length ? "" : bridge ? bridge.reasons?.prefixes || "" : "window_empty",
    },
  };
}

async function refreshTagsFromLatestUpdates(result) {
  const newTags = result.tags;

  if (newTags.length === 0) {
    debugLog(
      "Tag Update",
      `latestUpdates.tags unavailable/empty from ${result.source} (${result.reason || "unknown"}); keeping stored tags.`,
    );
    return;
  }

  if (toTagsOrderString(config.tags) === toTagsOrderString(newTags)) return;

  const persisted = await saveConfigKeys({ tags: newTags });
  if (!persisted.committed) return;
  debugLog(
    "Tag Update",
    `Tags updated from latestUpdates.tags (${result.source}): ${newTags.length} tags found.`,
  );
}

function buildPrunedTagLists() {
  const validTagIds = new Set(config.tags.map((t) => t.id));
  const pruneList = (list) => (Array.isArray(list) ? list.filter((id) => validTagIds.has(id)) : []);

  const oldPreferredCount = config.preferredTags.length;
  const oldExcludedCount = config.excludedTags.length;
  const oldMarkedCount = config.markedTags.length;

  const newPreferred = pruneList(config.preferredTags);
  const newExcluded = pruneList(config.excludedTags);
  const newMarked = pruneList(config.markedTags);

  const hasChanged =
    newPreferred.length !== oldPreferredCount ||
    newExcluded.length !== oldExcludedCount ||
    newMarked.length !== oldMarkedCount;

  const prunedCount = hasChanged
    ? oldPreferredCount -
      newPreferred.length +
      (oldExcludedCount - newExcluded.length) +
      (oldMarkedCount - newMarked.length)
    : 0;

  return {
    hasChanged,
    prunedCount,
    newPreferred,
    newExcluded,
    newMarked,
  };
}

async function applyPrunedTagLists({
  hasChanged,
  prunedCount,
  newPreferred,
  newExcluded,
  newMarked,
}) {
  if (!hasChanged) return;

  const persisted = await saveConfigKeys({
    preferredTags: newPreferred,
    excludedTags: newExcluded,
    markedTags: newMarked,
  });

  if (!persisted.committed) return;

  debugLog("Tag Update", `Pruned ${prunedCount} tags from preferred/excluded/marked lists.`);
}

export async function updateTags() {
  if (stateManager.get("tagsUpdateStatus") !== "IDLE") {
    debugLog("Tag Update", `Skipping update, status is: ${stateManager.get("tagsUpdateStatus")}`);
    return;
  }

  debugLog("Tag Update", "Starting tag update process...");
  stateManager.set("tagsUpdateStatus", "UPDATING");

  try {
    const catalogs = await readLatestCatalogs();
    const [tagUpdateResult, prefixUpdateResult] = await Promise.allSettled([
      refreshTagsFromLatestUpdates(catalogs.tags),
      updatePrefixes(catalogs.prefixes),
    ]);
    if (tagUpdateResult.status === "rejected") throw tagUpdateResult.reason;

    const prefixResult =
      prefixUpdateResult.status === "fulfilled" ? prefixUpdateResult.value : null;
    if (prefixUpdateResult.status === "rejected") {
      debugLog("Prefix Update", `Prefix refresh failed: ${prefixUpdateResult.reason}`, {
        level: "warn",
      });
    }

    const pruneResult = buildPrunedTagLists();
    await applyPrunedTagLists(pruneResult);

    checkTags(); // Safety check for empty tags
    stateManager.set("tagsUpdateStatus", "COMPLETE");
    debugLog("Tag Update", "Finished updating tags. Status: COMPLETE");
    return {
      pruned: pruneResult.hasChanged,
      count: pruneResult.prunedCount,
      prefixesUpdated: Boolean(prefixResult?.updated),
      prefixCount: Number(prefixResult?.count || 0),
    };
  } catch (error) {
    debugLog("Tag Update", `An error occurred during tag update: ${error}`, "error");
    // Reset to IDLE on error to allow a potential retry later
    stateManager.set("tagsUpdateStatus", "IDLE");
    return { pruned: false, count: 0 };
  }
}
