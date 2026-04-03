import stateManager, { config } from "../config.js";
import { ensurePageBridge, requestPageBridge } from "../core/pageBridge.js";
import { renderList } from "../ui/components/tag-search";

import { checkTags } from "./safetyService";
import { saveConfigKeys } from "./settingsService";
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

function normalizeTagsFromLatestUpdates(rawTags) {
  if (!rawTags) return [];

  const tagById = new Map();
  const upsert = (idRaw, nameRaw) => {
    const id = Number(idRaw);
    const name = String(nameRaw || "").trim();
    if (!Number.isFinite(id) || !name) return;
    if (!tagById.has(id)) tagById.set(id, { id, name });
  };

  if (Array.isArray(rawTags)) {
    rawTags.forEach((entry) => {
      if (!entry) return;
      if (Array.isArray(entry)) {
        upsert(entry[0], entry[1]);
        return;
      }
      if (typeof entry === "object") {
        upsert(entry.id, entry.name);
      }
    });
  } else if (typeof rawTags === "object") {
    Object.entries(rawTags).forEach(([id, name]) => upsert(id, name));
  }

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

function readLatestTagsFromWindow() {
  const latest = typeof window !== "undefined" ? window.latestUpdates || null : null;
  const tags = normalizeTagsFromLatestUpdates(latest?.tags);
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
  }).then((result) => {
    if (!result.received) {
      return {
        ok: false,
        source: "pageBridge",
        reason: result.reason || "bridge_timeout",
        tags: [],
      };
    }

    const detail = result.detail || {};
    const tags = normalizeTagsFromLatestUpdates(detail.tags);
    return {
      ok: Boolean(detail.ok) && tags.length > 0,
      source: "pageBridge",
      reason: typeof detail.reason === "string" ? detail.reason : "",
      tags,
    };
  });
}

/*
  Legacy DOM picker method (kept for rollback/reference):

  - Click picker input to populate dropdown options.
  - Read unselected options from dropdown + selected chips from selected wrap.
  - Merge by id to build full tag list.

  This was replaced by latestUpdates.tags because it is more complete/reliable on Latest pages.
*/
// async function refreshTagsFromPicker() {
//   const selector = document.querySelector(SELECTORS.TAG_PICKER.INPUT);
//   const dropdown = document.querySelector(SELECTORS.TAG_PICKER.DROPDOWN);
//   const selectedWrap = document.querySelector(SELECTORS.TAG_PICKER.SELECTED_WRAP);
//
//   if (!selector || (!dropdown && !selectedWrap)) return;
//   selector.click();
//
//   // Wait for dropdown options to populate.
//   if (dropdown) {
//     await waitFor(
//       () => dropdown.querySelectorAll(SELECTORS.TAG_PICKER.OPTION).length > 0,
//       TIMINGS.TILE_POPULATE_CHECK_INTERVAL,
//       TIMINGS.SELECTOR_WAIT_TIMEOUT,
//     );
//   }
//
//   const tagById = new Map();
//
//   if (dropdown) {
//     [...dropdown.querySelectorAll(SELECTORS.TAG_PICKER.OPTION)].forEach((opt) => {
//       const id = parseInt(opt.getAttribute("data-value"), 10);
//       const name = opt.querySelector(".tag-name")?.textContent.trim() || "";
//       if (!Number.isFinite(id) || !name) return;
//       tagById.set(id, { id, name });
//     });
//   }
//
//   if (selectedWrap) {
//     [...selectedWrap.querySelectorAll(SELECTORS.TAG_PICKER.SELECTED_TAG)].forEach((el) => {
//       const id = parseInt(el.getAttribute("data-tag"), 10);
//       const name = el.textContent?.trim() || "";
//       if (!Number.isFinite(id) || !name) return;
//       if (!tagById.has(id)) tagById.set(id, { id, name });
//     });
//   }
//
//   const newTags = [...tagById.values()];
//   if (newTags.length === 0) return;
// }

async function refreshTagsFromLatestUpdates() {
  const directResult = readLatestTagsFromWindow();
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

  config.tags = newTags;
  await GM.setValue("tags", config.tags);
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

  config.preferredTags = newPreferred;
  config.excludedTags = newExcluded;
  config.markedTags = newMarked;

  await saveConfigKeys({
    preferredTags: newPreferred,
    excludedTags: newExcluded,
    markedTags: newMarked,
  });

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
    await refreshTagsFromLatestUpdates();

    const pruneResult = buildPrunedTagLists();
    await applyPrunedTagLists(pruneResult);

    checkTags(); // Safety check for empty tags
    stateManager.set("tagsUpdateStatus", "COMPLETE");
    debugLog("Tag Update", "Finished updating tags. Status: COMPLETE");
    return { pruned: pruneResult.hasChanged, count: pruneResult.prunedCount };
  } catch (error) {
    debugLog("Tag Update", `An error occurred during tag update: ${error}`, "error");
    // Reset to IDLE on error to allow a potential retry later
    stateManager.set("tagsUpdateStatus", "IDLE");
    return { pruned: false, count: 0 };
  }
}
