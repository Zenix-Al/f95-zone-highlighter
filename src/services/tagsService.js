import { config, state } from "../config";
import { renderList } from "../ui/settings/searchTags";

import { checkTags } from "./safetyService";
import { saveConfigKeys } from "./settingsService";
import { debugLog } from "../core/logger";
import { waitFor } from "../core/dom";

export function updateSearch(event) {
  const query = event.target.value.trim().toLowerCase();
  const results = state.shadowRoot.getElementById("search-results");

  if (!query || !results) {
    if (results) results.style.display = "none";
    return;
  }

  const filteredTags = config.tags.filter((tag) => tag.name.toLowerCase().includes(query));

  renderList(filteredTags);
}
export function showAllTags() {
  const results = state.shadowRoot.getElementById("search-results");
  if (!results) return;
  renderList(config.tags);
  results.style.display = "block";
}

export async function updateTags() {
  if (state.tagsUpdated) return;

  const selector = document.querySelector(".selectize-input.items.not-full");
  const dropdown = document.querySelector(".selectize-dropdown.single.filter-tags-select");

  if (!selector || !dropdown) {
    debugLog("Tag Update", "Failed to find selector or dropdown elements");
    return;
  }
  selector.click();

  // wait until options exist
  try {
    await waitFor(() => dropdown.querySelectorAll(".option").length > 0, 50, 3000);
  } catch (err) {
    debugLog("Tag Update", `"Timeout waiting for options", ${err}`);
    return;
  }

  const options = [...dropdown.querySelectorAll(".option")];

  const newTags = options.map((opt) => ({
    id: parseInt(opt.getAttribute("data-value")),
    name: opt.querySelector(".tag-name")?.textContent.trim() || "",
  }));

  const arraysAreDifferent = !(
    config.tags.length === newTags.length &&
    config.tags.every(
      (tag, index) => tag.id === newTags[index].id && tag.name === newTags[index].name,
    )
  );

  if (arraysAreDifferent) {
    config.tags = newTags;
    await GM.setValue("tags", config.tags);

    debugLog("Tag Update", `Tags updated: ${JSON.stringify(newTags)}`);
  }
  const validTagIds = new Set(newTags.map((t) => t.id));

  const pruneIds = (list) =>
    Array.isArray(list) ? list.filter((id) => validTagIds.has(id)) : list;

  const newPreferred = pruneIds(config.preferredTags);
  const newExcluded = pruneIds(config.excludedTags);

  const changed =
    newPreferred.length !== config.preferredTags.length ||
    newExcluded.length !== config.excludedTags.length;

  if (changed) {
    config.preferredTags = newPreferred;
    config.excludedTags = newExcluded;

    saveConfigKeys({
      preferredTags: newPreferred,
      excludedTags: newExcluded,
    });
  }

  checkTags();
  state.tagsUpdated = true;
  debugLog("Tag Update", "Finished updating tags");
}
