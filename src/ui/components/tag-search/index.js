import stateManager, { config } from "../../../config.js";
import { isValidTag } from "../../../utils/validators.js";
import {
  debouncedProcessAllTilesReset,
  debouncedProcessThreadTags,
} from "../../../core/tasksRegistry";
import { saveConfigKeys } from "../../../services/settingsService";
import { showToast } from "../toast";

export function renderList(filteredTags) {
  const results = stateManager.get("shadowRoot").getElementById("search-results");
  const input = stateManager.get("shadowRoot").getElementById("tags-search");
  if (!results || !input) return;

  results.innerHTML = "";

  const visibleTags = filteredTags
    .filter(
      (tag) =>
        tag &&
        tag.id != null &&
        !config.preferredTags.includes(tag.id) &&
        !config.excludedTags.includes(tag.id),
    )
    .filter((tag) => isValidTag(String(tag.name || "")));

  if (visibleTags.length === 0) {
    results.style.display = "none";
    return;
  }

  const fragment = document.createDocumentFragment();
  visibleTags.forEach((tag) => {
    fragment.appendChild(createTagResultItem(tag, () => clearSearchAndHideResults(input, results)));
  });
  results.appendChild(fragment);

  results.style.display = "block";
}

/* ---------- helpers ---------- */

function triggerTagUpdateEffects() {
  debouncedProcessAllTilesReset();
  debouncedProcessThreadTags();
}

function handleTagAddition(listKey, tag, renderFn) {
  const list = config[listKey];
  if (!list.includes(tag.id)) {
    list.push(tag.id);
    const listType = listKey.includes("preferred") ? "preferred" : "excluded";
    const safeName = String(tag.name || "").trim();
    showToast(`${safeName} added to ${listType}`);
    saveConfigKeys({ [listKey]: list });
    renderFn(); // Re-render the specific list that changed
    triggerTagUpdateEffects();
  }
}

function clearSearchAndHideResults(input, results) {
  if (input) input.value = "";
  if (results) results.style.display = "none";
}

/**
 * Creates a list item for a tag search result.
 */
function createTagResultItem(tag, onActionComplete) {
  const li = document.createElement("li");
  li.className = "search-result-item";

  const nameSpan = document.createElement("span");
  nameSpan.textContent = String(tag.name || "").trim();

  const actions = document.createElement("div");
  actions.className = "tag-actions";

  actions.appendChild(
    createActionButton(
      "✓",
      "Add to preferred",
      "preferred",
      () => handleTagAddition("preferredTags", tag, renderPreferred),
      onActionComplete,
    ),
  );

  actions.appendChild(
    createActionButton(
      "✗",
      "Add to excluded",
      "excluded",
      () => handleTagAddition("excludedTags", tag, renderExcluded),
      onActionComplete,
    ),
  );

  li.appendChild(nameSpan);
  li.appendChild(actions);
  return li;
}

/**
 * Creates a button for adding a tag to preferred/excluded lists.
 */
function createActionButton(text, title, typeClass, onClick, onActionComplete) {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.title = title;
  btn.className = `tag-btn ${typeClass}`;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    onClick(); // Perform the specific action (add to preferred/excluded)
    onActionComplete(); // Perform common cleanup (clear search, hide results)
  });

  return btn;
}

function handleTagRemoval(listKey, tag, index, renderFn) {
  const list = config[listKey];
  list.splice(index, 1);

  const listType = listKey.includes("preferred") ? "preferred" : "excluded";
  showToast(`${tag.name} removed from ${listType}`);

  saveConfigKeys({ [listKey]: list });
  renderFn(); // Re-render the specific list that changed
  triggerTagUpdateEffects();
}

function handleTagReorder(listKey, fromIndex, toIndex, renderFn) {
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
  renderFn();
  triggerTagUpdateEffects();
}

export function renderPreferred() {
  renderTagList({
    listKey: "preferredTags",
    renderFn: renderPreferred,
    containerId: "preferred-tags-list",
    ids: config.preferredTags,
    itemClass: "preferred-tag-item",
    removeBtnClass: "",
    onRemove: (index, tag) => handleTagRemoval("preferredTags", tag, index, renderPreferred),
  });
}

export function renderExcluded() {
  renderTagList({
    listKey: "excludedTags",
    renderFn: renderExcluded,
    containerId: "excluded-tags-list",
    ids: config.excludedTags,
    itemClass: "excluded-tag-item",
    removeBtnClass: "",
    onRemove: (index, tag) => handleTagRemoval("excludedTags", tag, index, renderExcluded),
  });
}
function renderTagList({
  listKey,
  renderFn,
  containerId,
  ids,
  itemClass,
  removeBtnClass,
  onRemove,
}) {
  const container = stateManager.get("shadowRoot").getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";

  const fragment = document.createDocumentFragment();
  ids.forEach((id, index) => {
    const tag = config.tags.find((t) => t.id === id);
    if (!tag) return;
    if (!isValidTag(String(tag.name || ""))) return;
    fragment.appendChild(
      createTagListItem(tag, index, itemClass, removeBtnClass, onRemove, (fromIndex, toIndex) =>
        handleTagReorder(listKey, fromIndex, toIndex, renderFn),
      ),
    );
  });
  container.appendChild(fragment);
}
function createTagListItem(tag, index, itemClass, removeBtnClass, onRemove, onReorder) {
  const item = document.createElement("div");
  item.className = `tag-list-item ${itemClass}`;
  item.dataset.index = String(index);

  const text = document.createElement("span");
  text.textContent = tag.name;

  const dragHandle = document.createElement("span");
  dragHandle.className = "tag-drag-handle";
  dragHandle.title = "Drag to reorder";
  dragHandle.textContent = "≡";
  dragHandle.draggable = true;

  dragHandle.addEventListener("dragstart", (e) => {
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    item.classList.add("dragging");
  });

  dragHandle.addEventListener("dragend", () => {
    item.classList.remove("dragging");
  });

  const removeBtn = document.createElement("button");
  removeBtn.textContent = "X";
  removeBtn.className = `tag-remove-btn ${removeBtnClass}`;

  removeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    onRemove(index, tag);
  });

  item.addEventListener("dragover", (e) => {
    e.preventDefault();
    item.classList.add("drag-over");
  });

  item.addEventListener("dragleave", () => {
    item.classList.remove("drag-over");
  });

  item.addEventListener("drop", (e) => {
    e.preventDefault();
    item.classList.remove("drag-over");
    const fromIndex = Number(e.dataTransfer?.getData("text/plain"));
    const toIndex = index;
    if (Number.isNaN(fromIndex)) return;
    onReorder(fromIndex, toIndex);
  });

  item.addEventListener("click", () => {
    item.classList.toggle("reorder-active");
  });

  item.appendChild(text);
  item.appendChild(dragHandle);
  item.appendChild(removeBtn);

  return item;
}
export function initTagSearchListeners() {
  document.addEventListener("click", (e) => {
    const input = document.getElementById("tags-search");
    const results = document.getElementById("search-results");
    if (!input || !results) return;

    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.style.display = "none";
    }
  });
}
