import { config, state } from "../../../config";
import {
  debouncedProcessAllTilesReset,
  debouncedProcessThreadTags,
} from "../../../core/tasksRegistry";
import { saveConfigKeys } from "../../../services/settingsService";
import { showToast } from "../modal";

export function renderList(filteredTags) {
  const results = state.shadowRoot.getElementById("search-results");
  const input = state.shadowRoot.getElementById("tags-search");
  if (!results || !input) return;

  results.innerHTML = "";

  const visibleTags = filteredTags.filter(
    (tag) => !config.preferredTags.includes(tag.id) && !config.excludedTags.includes(tag.id),
  );

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
    showToast(`${tag.name} added to ${listType}`);
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
  nameSpan.textContent = tag.name;

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

export function renderPreferred() {
  renderTagList({
    containerId: "preffered-tags-list",
    ids: config.preferredTags,
    itemClass: "preferred-tag-item",
    removeBtnClass: "preferred-tag-remove",
    onRemove: (index, tag) => handleTagRemoval("preferredTags", tag, index, renderPreferred),
  });
}

export function renderExcluded() {
  renderTagList({
    containerId: "excluded-tags-list",
    ids: config.excludedTags,
    itemClass: "excluded-tag-item",
    removeBtnClass: "excluded-tag-remove",
    onRemove: (index, tag) => handleTagRemoval("excludedTags", tag, index, renderExcluded),
  });
}
function renderTagList({ containerId, ids, itemClass, removeBtnClass, onRemove }) {
  const container = state.shadowRoot.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";

  const fragment = document.createDocumentFragment();
  ids.forEach((id, index) => {
    const tag = config.tags.find((t) => t.id === id);
    if (!tag) return;
    fragment.appendChild(createTagListItem(tag, index, itemClass, removeBtnClass, onRemove));
  });
  container.appendChild(fragment);
}
function createTagListItem(tag, index, itemClass, removeBtnClass, onRemove) {
  const item = document.createElement("div");
  item.className = `tag-list-item ${itemClass}`;

  const text = document.createElement("span");
  text.textContent = tag.name;

  const removeBtn = document.createElement("button");
  removeBtn.textContent = "X";
  removeBtn.className = `tag-remove-btn ${removeBtnClass}`;

  removeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    onRemove(index, tag);
  });

  item.appendChild(text);
  item.appendChild(removeBtn);

  return item;
}
