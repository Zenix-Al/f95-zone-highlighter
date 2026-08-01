import { config } from "../../../config.js";
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
import { getShadowRoot } from "../../getShadowRoot.js";
import { registerTeardownResetter } from "../../../core/teardown.js";

export const TAG_SEARCH_RESULT_CHUNK_SIZE = 60;

const TAG_ACTIONS = Object.freeze({
  preferred: { listKey: "preferredTags", render: () => renderPreferred() },
  excluded: { listKey: "excludedTags", render: () => renderExcluded() },
  marked: { listKey: "markedTags", render: () => renderMarked() },
});

let resultGeneration = 0;
let activeResultState = null;

registerTeardownResetter(() => hideTagSearchResults());

function getTagById(tagId) {
  return config.tags.find((tag) => tag.id === tagId);
}

function refreshSearchResultsAfterAction(input, results) {
  if (!input || !results) return;

  const query = input.value.trim().toLowerCase();
  const filteredTags = query
    ? config.tags.filter((tag) =>
        String(tag.name || "")
          .toLowerCase()
          .includes(query),
      )
    : config.tags;

  renderList(filteredTags);
  input.focus();
  const end = input.value.length;
  input.setSelectionRange?.(end, end);
}

function updateSearchClearButtonState(input, clearBtn) {
  if (!input || !clearBtn) return;
  const hasValue = input.value.trim().length > 0;
  clearBtn.classList.toggle("visible", hasValue);
  clearBtn.disabled = !hasValue;
}

function createActionButton(text, title, typeClass, tagId) {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.title = title;
  btn.className = `tag-btn ${typeClass}`;
  btn.dataset.tagAction = typeClass;
  btn.dataset.tagId = String(tagId);

  return btn;
}

function createTagResultItem(tag) {
  const li = document.createElement("li");
  li.className = "search-result-item";
  li.dataset.tagResultId = String(tag.id);

  const nameSpan = document.createElement("span");
  nameSpan.textContent = String(tag.name || "").trim();

  const actions = document.createElement("div");
  actions.className = "tag-actions";

  actions.appendChild(
    createActionButton(
      "✓",
      "Add to preferred",
      "preferred",
      tag.id,
    ),
  );

  actions.appendChild(
    createActionButton(
      "✗",
      "Add to excluded",
      "excluded",
      tag.id,
    ),
  );

  actions.appendChild(
    createActionButton(
      "◈",
      "Add to marked",
      "marked",
      tag.id,
    ),
  );

  li.appendChild(nameSpan);
  li.appendChild(actions);
  return li;
}

function createLoadMoreItem(remaining) {
  const li = document.createElement("li");
  li.className = "tag-search-load-more-row";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tag-search-load-more";
  button.dataset.tagSearchAction = "load-more";
  button.textContent = `Load more (${remaining})`;
  li.appendChild(button);
  return li;
}

function nextResultGeneration() {
  resultGeneration += 1;
  return resultGeneration;
}

export function hideTagSearchResults(results = getShadowRoot()?.getElementById("search-results")) {
  nextResultGeneration();
  activeResultState = null;
  if (results) {
    results.innerHTML = "";
    results.style.display = "none";
  }
}

function renderActiveResultState() {
  const state = activeResultState;
  if (!state || state.generation !== resultGeneration) return;
  const { results, visibleTags, visibleCount } = state;
  results.innerHTML = "";
  if (visibleTags.length === 0) {
    results.style.display = "none";
    return;
  }

  const fragment = document.createDocumentFragment();
  visibleTags.slice(0, visibleCount).forEach((tag) => {
    fragment.appendChild(createTagResultItem(tag));
  });
  if (visibleCount < visibleTags.length) {
    fragment.appendChild(createLoadMoreItem(visibleTags.length - visibleCount));
  }
  results.appendChild(fragment);
  results.style.display = "block";
}

async function handleDelegatedResultClick(event, input, results) {
  const target = event.target?.closest?.("button");
  if (!target || !results.contains(target)) return;

  if (target.dataset.tagSearchAction === "load-more") {
    event.preventDefault();
    event.stopPropagation();
    if (!activeResultState || activeResultState.results !== results) return;
    activeResultState.visibleCount = Math.min(
      activeResultState.visibleTags.length,
      activeResultState.visibleCount + TAG_SEARCH_RESULT_CHUNK_SIZE,
    );
    renderActiveResultState();
    return;
  }

  const action = TAG_ACTIONS[target.dataset.tagAction];
  const tagId = Number(target.dataset.tagId);
  const tag = Number.isFinite(tagId) ? getTagById(tagId) : null;
  if (!action || !tag || !isValidTag(String(tag.name || ""))) return;
  if (!activeResultState?.visibleTags.some((candidate) => candidate.id === tagId)) return;

  event.preventDefault();
  event.stopPropagation();
  const result = await addTagToList({
    listKey: action.listKey,
    tag,
    render: action.render,
  });
  if (!result?.committed || !activeResultState || results.style.display === "none") return;
  refreshSearchResultsAfterAction(input, results);
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
    onDropOnItem: handleListItemDrop,
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

  activeResultState = {
    generation: nextResultGeneration(),
    results,
    visibleTags,
    visibleCount: Math.min(TAG_SEARCH_RESULT_CHUNK_SIZE, visibleTags.length),
  };
  renderActiveResultState();
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
  ensurePointerCleanupHooks();

  const shadowRoot = getShadowRoot();
  const input = shadowRoot?.getElementById("tags-search");
  const results = shadowRoot?.getElementById("search-results");
  const clearBtn = shadowRoot?.getElementById("tags-search-clear");

  if (input && results && !results.dataset.tagActionsBound) {
    results.dataset.tagActionsBound = "1";
    results.addEventListener("click", (event) => {
      void handleDelegatedResultClick(event, input, results);
    });
  }

  if (input && clearBtn && !clearBtn.dataset.initBound) {
    clearBtn.dataset.initBound = "1";

    const syncState = () => updateSearchClearButtonState(input, clearBtn);
    input.addEventListener("input", syncState);
    input.addEventListener("focus", syncState);

    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.value = "";
      hideTagSearchResults(results);
      syncState();
      input.focus();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        hideTagSearchResults(results);
        input.blur();
        syncState();
      }
    });

    syncState();
  }

}
