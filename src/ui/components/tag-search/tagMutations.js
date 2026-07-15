import { config } from "../../../config.js";
import { updateConfig } from "../../../services/settingsService.js";
import { showToast } from "../toast";

function getListTypeLabel(listKey) {
  if (listKey.includes("preferred")) return "preferred";
  if (listKey.includes("excluded")) return "excluded";
  return "marked";
}

export async function addTagToList({ listKey, tag, render }) {
  const result = await updateConfig((draft) => {
    const list = Array.isArray(draft[listKey]) ? draft[listKey] : null;
    if (!Array.isArray(list) || list.includes(tag.id)) return false;
    list.push(tag.id);
    return true;
  }, { origin: `tag-search:add:${listKey}` });
  if (!result.committed) return result;

  const safeName = String(tag.name || "").trim();
  showToast(`${safeName} added to ${getListTypeLabel(listKey)}`);
  render();
  return result;
}

export async function removeTagFromList({ listKey, tag, index, render }) {
  const result = await updateConfig((draft) => {
    const list = Array.isArray(draft[listKey]) ? draft[listKey] : null;
    if (!Array.isArray(list) || index < 0 || index >= list.length) return false;
    list.splice(index, 1);
    return true;
  }, { origin: `tag-search:remove:${listKey}` });
  if (!result.committed) return result;

  showToast(`${tag.name} removed from ${getListTypeLabel(listKey)}`);
  render();
  return result;
}

export async function reorderTagInList({ listKey, fromIndex, toIndex, render }) {
  const result = await updateConfig((draft) => {
    const list = Array.isArray(draft[listKey]) ? draft[listKey] : null;
    if (
      !Array.isArray(list) ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= list.length ||
      toIndex >= list.length ||
      fromIndex === toIndex
    ) return false;

    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    return true;
  }, { origin: `tag-search:reorder:${listKey}` });
  if (!result.committed) return result;

  render();
  return result;
}

export async function moveTagAcrossLists({
  fromListKey,
  toListKey,
  fromIndex,
  toIndex,
  renderPreferred,
  renderExcluded,
  renderMarked,
}) {
  let duplicateId = null;
  let movedId = null;
  const result = await updateConfig((draft) => {
    const fromList = Array.isArray(draft[fromListKey]) ? draft[fromListKey] : null;
    const toList = Array.isArray(draft[toListKey]) ? draft[toListKey] : null;
    if (!Array.isArray(fromList) || !Array.isArray(toList)) return false;
    if (!Number.isFinite(fromIndex) || fromIndex < 0 || fromIndex >= fromList.length) return false;

    movedId = fromList[fromIndex];
    if (toList.includes(movedId)) {
      duplicateId = movedId;
      return false;
    }

    fromList.splice(fromIndex, 1);
    if (Number.isFinite(toIndex) && toIndex >= 0 && toIndex <= toList.length) {
      toList.splice(toIndex, 0, movedId);
    } else {
      toList.push(movedId);
    }
    return true;
  }, { origin: `tag-search:move:${fromListKey}:${toListKey}` });

  if (duplicateId !== null) {
    const existingTag = config.tags.find((t) => t.id === duplicateId);
    showToast(`${existingTag?.name || duplicateId} is already in the target list.`);
    return result;
  }
  if (!result.committed) return result;

  if (fromListKey === "preferredTags") renderPreferred();
  if (fromListKey === "excludedTags") renderExcluded();
  if (fromListKey === "markedTags") renderMarked();
  if (toListKey === "preferredTags") renderPreferred();
  if (toListKey === "excludedTags") renderExcluded();
  if (toListKey === "markedTags") renderMarked();

  const movedTag = config.tags.find((t) => t.id === movedId);
  showToast(
    `Moved ${movedTag?.name || movedId} to ${getListTypeLabel(toListKey)}`,
  );
  return result;
}
