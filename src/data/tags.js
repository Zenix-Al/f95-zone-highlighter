import { debug, config, state } from "../constants";
import { saveConfigKeys } from "../storage/save";
import { waitFor } from "../utils/waitFor";
export async function updateTags() {
  if (state.tagsUpdated) return;

  const selector = document.querySelector(".selectize-input.items.not-full");
  const dropdown = document.querySelector(
    ".selectize-dropdown.single.filter-tags-select"
  );

  if (!selector || !dropdown) {
    if (debug) console.log("updateTags: failed to find selector/dropdown");
    return;
  }
  selector.click();

  // wait until options exist
  try {
    await waitFor(
      () => dropdown.querySelectorAll(".option").length > 0,
      50,
      3000
    );
  } catch (err) {
    if (debug) console.log("updateTags: timeout waiting for options", err);
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
      (tag, index) =>
        tag.id === newTags[index].id && tag.name === newTags[index].name
    )
  );

  if (arraysAreDifferent) {
    config.tags = newTags;
    saveConfigKeys({ tags: config.tags });
    if (debug) console.log("updateTags: tags updated", newTags);
  }

  state.tagsUpdated = true;
  if (debug) console.log("updateTags: finished");
}
