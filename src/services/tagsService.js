import { stateManager, config } from "../config.js";
import { ensurePageBridge, requestPageBridge } from "../core/pageBridge.js";
import { runFrameBudgeted } from "../core/frameBudget.js";
import { renderList } from "../ui/components/tag-search";

import { checkTags } from "./safetyService";
import { saveConfigKeys } from "./settingsService";
import { updatePrefixes } from "./prefixService.js";
import { debugLog } from "../core/logger";

const LATEST_TAGS_BRIDGE_REQUEST_EVENT = "f95ue:latest-tags-request";
const LATEST_TAGS_BRIDGE_RESULT_EVENT = "f95ue:latest-tags-result";
const LATEST_TAGS_BRIDGE_MARKER = "f95ue_latest_tags_bridge_installed";

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

function ensureLatestTagsPageBridge() {
  return ensurePageBridge({
    marker: LATEST_TAGS_BRIDGE_MARKER,
    scriptContent: `
    (() => {
      if (window.__f95ueLatestTagsBridgeInstalled) return;
      window.__f95ueLatestTagsBridgeInstalled = true;

      window.addEventListener("${LATEST_TAGS_BRIDGE_REQUEST_EVENT}", () => {
        let ok = false;
        let reason = "";
        let tags = null;

        try {
          const latest = window.latestUpdates;
          const latestTags = latest && latest.tags;
          if (latestTags) {
            tags = latestTags;
            ok = true;
          } else {
            reason = "latest_updates_missing_tags";
          }
        } catch (error) {
          reason = error?.message ? String(error.message) : "latest_updates_read_throw";
        }

        try {
          window.dispatchEvent(
            new CustomEvent("${LATEST_TAGS_BRIDGE_RESULT_EVENT}", {
              detail: { ok, reason, tags },
            }),
          );
        } catch {}
      });
    })();
  `,
  });
}

async function readLatestTagsFromWindow() {
  const latest = typeof window !== "undefined" ? window.latestUpdates || null : null;
  const tags = await normalizeTagsFromLatestUpdatesBudgeted(latest?.tags);
  return { ok: tags.length > 0, source: "window", reason: tags.length ? "" : "window_empty", tags };
}

function readLatestTagsViaPageBridge(timeoutMs = 1200) {
  const bridgeReady = ensureLatestTagsPageBridge();
  if (!bridgeReady) {
    return Promise.resolve({
      ok: false,
      source: "pageBridge",
      reason: "bridge_inject_failed",
      tags: [],
    });
  }

  return requestPageBridge({
    requestEvent: LATEST_TAGS_BRIDGE_REQUEST_EVENT,
    resultEvent: LATEST_TAGS_BRIDGE_RESULT_EVENT,
    timeoutMs,
  }).then(async (result) => {
    if (!result.received) {
      return {
        ok: false,
        source: "pageBridge",
        reason: result.reason || "bridge_timeout",
        tags: [],
      };
    }

    const detail = result.detail || {};
    const tags = await normalizeTagsFromLatestUpdatesBudgeted(detail.tags);
    return {
      ok: Boolean(detail.ok) && tags.length > 0,
      source: "pageBridge",
      reason: typeof detail.reason === "string" ? detail.reason : "",
      tags,
    };
  });
}

async function refreshTagsFromLatestUpdates() {
  const directResult = await readLatestTagsFromWindow();
  const result = directResult.ok ? directResult : await readLatestTagsViaPageBridge();
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
    const [tagUpdateResult, prefixUpdateResult] = await Promise.allSettled([
      refreshTagsFromLatestUpdates(),
      updatePrefixes(),
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
