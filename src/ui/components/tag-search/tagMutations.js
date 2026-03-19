import { config } from "../../../config.js";
import { saveConfigKeys } from "../../../services/settingsService";
import { showToast } from "../toast";
import { triggerTagUpdateEffects } from "./tagEffects";

function getListTypeLabel(listKey) {
  if (listKey.includes("preferred")) return "preferred";
  if (listKey.includes("excluded")) return "excluded";
  return "marked";
}

export function addTagToList({ listKey, tag, render }) {
  const list = config[listKey];
  if (!Array.isArray(list) || list.includes(tag.id)) return;

  list.push(tag.id);
  const safeName = String(tag.name || "").trim();
  showToast(`${safeName} added to ${getListTypeLabel(listKey)}`);
  saveConfigKeys({ [listKey]: list });
  render();
  triggerTagUpdateEffects();
}

export function removeTagFromList({ listKey, tag, index, render }) {
  const list = config[listKey];
  if (!Array.isArray(list) || index < 0 || index >= list.length) return;

  list.splice(index, 1);
  showToast(`${tag.name} removed from ${getListTypeLabel(listKey)}`);
  saveConfigKeys({ [listKey]: list });
  render();
  triggerTagUpdateEffects();
}

export function reorderTagInList({ listKey, fromIndex, toIndex, render }) {
  const list = config[listKey];
  if (
    !Array.isArray(list) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= list.length ||
    toIndex >= list.length ||
    fromIndex === toIndex
  ) {
    return;
  }

  const [moved] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, moved);

  saveConfigKeys({ [listKey]: list });
  render();
  triggerTagUpdateEffects();
}

export function moveTagAcrossLists({
  fromListKey,
  toListKey,
  fromIndex,
  toIndex,
  renderPreferred,
  renderExcluded,
  renderMarked,
}) {
  const fromList = config[fromListKey];
  const toList = config[toListKey];
  if (!Array.isArray(fromList) || !Array.isArray(toList)) return;
  if (!Number.isFinite(fromIndex) || fromIndex < 0 || fromIndex >= fromList.length) return;

  const movedId = fromList[fromIndex];
  if (toList.includes(movedId)) {
    const existingTag = config.tags.find((t) => t.id === movedId);
    showToast(`${existingTag?.name || movedId} is already in the target list.`);
    return;
  }

  fromList.splice(fromIndex, 1);

  if (Number.isFinite(toIndex) && toIndex >= 0 && toIndex <= toList.length) {
    toList.splice(toIndex, 0, movedId);
  } else {
    toList.push(movedId);
  }

  saveConfigKeys({
    [fromListKey]: fromList,
    [toListKey]: toList,
  });

  if (fromListKey === "preferredTags") renderPreferred();
  if (fromListKey === "excludedTags") renderExcluded();
  if (fromListKey === "markedTags") renderMarked();
  if (toListKey === "preferredTags") renderPreferred();
  if (toListKey === "excludedTags") renderExcluded();
  if (toListKey === "markedTags") renderMarked();

  triggerTagUpdateEffects();

  const movedTag = config.tags.find((t) => t.id === movedId);
  showToast(
    `Moved ${movedTag?.name || movedId} to ${toListKey.includes("preferred") ? "preferred" : "excluded"}`,
  );
}
