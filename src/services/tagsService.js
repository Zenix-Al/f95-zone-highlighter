import stateManager, { config } from "../config.js";
import { renderList } from "../ui/components/tag-search";

import { checkTags } from "./safetyService";
import { saveConfigKeys } from "./settingsService";
import { debugLog } from "../core/logger";
import { waitFor } from "../core/dom";
import TIMINGS from "../config/timings.js";
import { SELECTORS } from "../config/selectors.js";

export function updateSearch(event) {
  checkTags(); // Ensure warning is visible if tags are missing
  const query = event.target.value.trim().toLowerCase();
  const results = stateManager.get("shadowRoot").getElementById("search-results");

  if (!query || !results) {
    if (results) results.style.display = "none";
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

export async function updateTags() {
  if (stateManager.get("tagsUpdateStatus") !== "IDLE") {
    debugLog("Tag Update", `Skipping update, status is: ${stateManager.get("tagsUpdateStatus")}`);
    return;
  }

  debugLog("Tag Update", "Starting tag update process...");
  stateManager.set("tagsUpdateStatus", "UPDATING");

  try {
    const selector = document.querySelector(SELECTORS.TAG_PICKER.INPUT);
    const dropdown = document.querySelector(SELECTORS.TAG_PICKER.DROPDOWN);

    if (selector && dropdown) {
      selector.click();

      // wait until options exist
      await waitFor(
        () => dropdown.querySelectorAll(".option").length > 0,
        TIMINGS.TILE_POPULATE_CHECK_INTERVAL,
        TIMINGS.SELECTOR_WAIT_TIMEOUT,
      );

      const options = [...dropdown.querySelectorAll(".option")];

      const newTags = options.map((opt) => ({
        id: parseInt(opt.getAttribute("data-value")),
        name: opt.querySelector(".tag-name")?.textContent.trim() || "",
      }));

      if (newTags.length > 0) {
        // A robust, order-independent check to see if the tag list has actually changed.
        // We sort by ID and stringify to compare the content, not the order.
        const oldTagsString = JSON.stringify(config.tags.slice().sort((a, b) => a.id - b.id));
        const newTagsString = JSON.stringify(newTags.slice().sort((a, b) => a.id - b.id));
        const arraysAreDifferent = oldTagsString !== newTagsString;

        if (arraysAreDifferent) {
          config.tags = newTags;
          await GM.setValue("tags", config.tags);
          debugLog("Tag Update", `Tags updated and saved: ${newTags.length} tags found.`);
        }
      }
    } else {
      debugLog("Tag Update", "Tag source elements not found, will use tags from storage.");
    }

    // Prune tags based on the latest valid list (either newly fetched or from storage)
    const validTagIds = new Set(config.tags.map((t) => t.id));

    const pruneList = (list) =>
      Array.isArray(list) ? list.filter((id) => validTagIds.has(id)) : [];

    const oldPreferredCount = config.preferredTags.length;
    const oldExcludedCount = config.excludedTags.length;
    const oldMarkedCount = config.markedTags.length;

    const newPreferred = pruneList(config.preferredTags);
    const newExcluded = pruneList(config.excludedTags);
    const newMarked = pruneList(config.markedTags);

    const listsHaveChanged =
      newPreferred.length !== oldPreferredCount ||
      newExcluded.length !== oldExcludedCount ||
      newMarked.length !== oldMarkedCount;

    let prunedCount = 0;
    if (listsHaveChanged) {
      prunedCount =
        oldPreferredCount -
        newPreferred.length +
        (oldExcludedCount - newExcluded.length) +
        (oldMarkedCount - newMarked.length);

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

    checkTags(); // Safety check for empty tags
    stateManager.set("tagsUpdateStatus", "COMPLETE");
    debugLog("Tag Update", "Finished updating tags. Status: COMPLETE");
    return { pruned: listsHaveChanged, count: prunedCount };
  } catch (error) {
    debugLog("Tag Update", `An error occurred during tag update: ${error}`, "error");
    // Reset to IDLE on error to allow a potential retry later
    stateManager.set("tagsUpdateStatus", "IDLE");
    return { pruned: false, count: 0 };
  }
}
