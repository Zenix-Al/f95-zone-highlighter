import { config, state } from "../constants";
import { checkTags } from "../cores/safety";
import { saveConfigKeys } from "../storage/save";
import { debugLog } from "../utils/debugOutput";
import { waitFor } from "../utils/waitFor";
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
      (tag, index) => tag.id === newTags[index].id && tag.name === newTags[index].name
    )
  );

  if (arraysAreDifferent) {
    config.tags = newTags;
    saveConfigKeys({ tags: config.tags });
    debugLog("Tag Update", `Tags updated: ${JSON.stringify(newTags)}`);
  }
  checkTags();
  state.tagsUpdated = true;
  debugLog("Tag Update", "Finished updating tags");
}
