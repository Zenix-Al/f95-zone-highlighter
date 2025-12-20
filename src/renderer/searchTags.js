import { config } from "../constants";
import { saveConfigKeys } from "../storage/save";
import { showToast } from "../ui/modal";

export function renderList(filteredTags) {
  const results = document.getElementById("search-results");
  const input = document.getElementById("tags-search");
  if (!results || !input) return;

  results.innerHTML = "";

  const visibleTags = filteredTags.filter(
    (tag) => !config.preferredTags.includes(tag.id) && !config.excludedTags.includes(tag.id)
  );

  if (visibleTags.length === 0) {
    results.style.display = "none";
    return;
  }

  visibleTags.forEach((tag) => {
    results.appendChild(createTagResultItem(tag, input, results));
  });

  results.style.display = "block";
}

/* ---------- helpers ---------- */

function createTagResultItem(tag, input, results) {
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
      () => {
        if (!config.preferredTags.includes(tag.id)) {
          config.preferredTags.push(tag.id);
          renderPreferred();
          showToast(`${tag.name} added to preferred`);
          saveConfigKeys({ preferredTags: config.preferredTags });
        }
      },
      input,
      results
    )
  );

  actions.appendChild(
    createActionButton(
      "✗",
      "Add to excluded",
      "excluded",
      () => {
        if (!config.excludedTags.includes(tag.id)) {
          config.excludedTags.push(tag.id);
          renderExcluded();
          showToast(`${tag.name} added to exclusion`);
          saveConfigKeys({ excludedTags: config.excludedTags });
        }
      },
      input,
      results
    )
  );

  li.appendChild(nameSpan);
  li.appendChild(actions);

  return li;
}

function createActionButton(text, title, typeClass, onClick, input, results) {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.title = title;
  btn.className = `tag-btn ${typeClass}`;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    onClick();

    input.value = "";
    results.style.display = "none";
  });

  return btn;
}

export function renderPreferred() {
  renderTagList({
    containerId: "preffered-tags-list",
    ids: config.preferredTags,
    itemClass: "preferred-tag-item",
    removeBtnClass: "preferred-tag-remove",
    onRemove: (index, tag) => {
      config.preferredTags.splice(index, 1);
      showToast(`${tag.name} removed from preferred`);
      saveConfigKeys({ preferredTags: config.preferredTags });
    },
  });
}

export function renderExcluded() {
  renderTagList({
    containerId: "excluded-tags-list",
    ids: config.excludedTags,
    itemClass: "excluded-tag-item",
    removeBtnClass: "excluded-tag-remove",
    onRemove: (index, tag) => {
      config.excludedTags.splice(index, 1);
      showToast(`${tag.name} removed from exclusion`);
      saveConfigKeys({ excludedTags: config.excludedTags });
    },
  });
}
function renderTagList({ containerId, ids, itemClass, removeBtnClass, onRemove }) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";

  ids.forEach((id, index) => {
    const tag = config.tags.find((t) => t.id === id);
    if (!tag) return;

    container.appendChild(createTagListItem(tag, index, itemClass, removeBtnClass, onRemove));
  });
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

    // re-render handled by caller
    if (itemClass.includes("preferred")) renderPreferred();
    else renderExcluded();
  });

  item.appendChild(text);
  item.appendChild(removeBtn);

  return item;
}
