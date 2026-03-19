import stateManager, { config } from "../../../config.js";
import { isValidTag } from "../../../utils/validators.js";
import {
  addTagToList,
  moveTagAcrossLists,
  removeTagFromList,
  reorderTagInList,
} from "./tagMutations";
import {
  createTagChipItem,
  ensureContainerDropHandlers,
  ensurePointerCleanupHooks,
} from "./tagDrag";

function getShadowRoot() {
  return stateManager.get("shadowRoot");
}

function getTagById(tagId) {
  return config.tags.find((tag) => tag.id === tagId);
}

function clearSearchAndHideResults(input, results) {
  if (input) input.value = "";
  if (results) results.style.display = "none";
}

function createActionButton(text, title, typeClass, onClick, onActionComplete) {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.title = title;
  btn.className = `tag-btn ${typeClass}`;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
    onActionComplete();
  });

  return btn;
}

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
      () => addTagToList({ listKey: "preferredTags", tag, render: renderPreferred }),
      onActionComplete,
    ),
  );

  actions.appendChild(
    createActionButton(
      "✗",
      "Add to excluded",
      "excluded",
      () => addTagToList({ listKey: "excludedTags", tag, render: renderExcluded }),
      onActionComplete,
    ),
  );

  actions.appendChild(
    createActionButton(
      "◈",
      "Add to marked",
      "marked",
      () => addTagToList({ listKey: "markedTags", tag, render: renderMarked }),
      onActionComplete,
    ),
  );

  li.appendChild(nameSpan);
  li.appendChild(actions);
  return li;
}

function getRenderFn(listKey) {
  if (listKey === "preferredTags") return renderPreferred;
  if (listKey === "excludedTags") return renderExcluded;
  return renderMarked;
}

function handleListContainerDrop({ fromList, fromIndex, toListKey }) {
  const destinationList = config[toListKey];
  if (!Array.isArray(destinationList) || !Number.isFinite(fromIndex)) return;

  if (fromList === toListKey) {
    if (destinationList.length === 0) return;
    reorderTagInList({
      listKey: toListKey,
      fromIndex,
      toIndex: destinationList.length - 1,
      render: getRenderFn(toListKey),
    });
    return;
  }

  moveTagAcrossLists({
    fromListKey: fromList,
    toListKey,
    fromIndex,
    toIndex: destinationList.length,
    renderPreferred,
    renderExcluded,
    renderMarked,
  });
}

function handleListItemDrop({ fromList, fromIndex, toListKey, toIndex }) {
  if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex)) return;

  if (fromList === toListKey) {
    reorderTagInList({
      listKey: toListKey,
      fromIndex,
      toIndex,
      render: getRenderFn(toListKey),
    });
    return;
  }

  moveTagAcrossLists({
    fromListKey: fromList,
    toListKey,
    fromIndex,
    toIndex,
    renderPreferred,
    renderExcluded,
    renderMarked,
  });
}

function renderTagList({ listKey, containerId, ids, itemClass }) {
  const container = getShadowRoot()?.getElementById(containerId);
  if (!container) return;

  ensureContainerDropHandlers({
    container,
    listKey,
    onDropOnContainer: handleListContainerDrop,
  });

  container.innerHTML = "";

  const fragment = document.createDocumentFragment();
  ids.forEach((tagId, index) => {
    const tag = getTagById(tagId);
    if (!tag || !isValidTag(String(tag.name || ""))) return;

    fragment.appendChild(
      createTagChipItem({
        tag,
        index,
        itemClass,
        removeBtnClass: "",
        listKey,
        onRemove: (removeIndex, removeTag) =>
          removeTagFromList({
            listKey,
            tag: removeTag,
            index: removeIndex,
            render: getRenderFn(listKey),
          }),
        onDropOnItem: handleListItemDrop,
        onDropOnContainer: handleListContainerDrop,
        getShadowRoot,
      }),
    );
  });

  container.appendChild(fragment);
}

export function renderList(filteredTags) {
  const shadowRoot = getShadowRoot();
  const results = shadowRoot?.getElementById("search-results");
  const input = shadowRoot?.getElementById("tags-search");
  if (!results || !input) return;

  results.innerHTML = "";

  const visibleTags = filteredTags
    .filter(
      (tag) =>
        tag &&
        tag.id != null &&
        !config.preferredTags.includes(tag.id) &&
        !config.excludedTags.includes(tag.id) &&
        !config.markedTags.includes(tag.id),
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

export function renderPreferred() {
  renderTagList({
    listKey: "preferredTags",
    containerId: "preferred-tags-list",
    ids: config.preferredTags,
    itemClass: "preferred-tag-item",
  });
}

export function renderExcluded() {
  renderTagList({
    listKey: "excludedTags",
    containerId: "excluded-tags-list",
    ids: config.excludedTags,
    itemClass: "excluded-tag-item",
  });
}

export function renderMarked() {
  renderTagList({
    listKey: "markedTags",
    containerId: "marked-tags-list",
    ids: config.markedTags,
    itemClass: "marked-tag-item",
  });
}

export function initTagSearchListeners() {
  ensurePointerCleanupHooks(getShadowRoot);

  document.addEventListener("click", (e) => {
    const input = document.getElementById("tags-search");
    const results = document.getElementById("search-results");
    if (!input || !results) return;

    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.style.display = "none";
    }
  });
}
