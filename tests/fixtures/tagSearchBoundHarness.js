import { config, stateManager } from "../../src/config.js";
import { loadConfig } from "../../src/services/settingsService.js";
import {
  hideTagSearchResults,
  initTagSearchListeners,
  renderList,
  TAG_SEARCH_RESULT_CHUNK_SIZE,
} from "../../src/ui/components/tag-search/index.js";

function makeTags(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Tag ${String(index + 1).padStart(3, "0")}`,
  }));
}

export async function setupTagSearchHarness(count = 130) {
  await loadConfig();
  const tags = makeTags(count);
  config.tags = tags;
  config.preferredTags = [];
  config.excludedTags = [];
  config.markedTags = [];

  const host = document.createElement("div");
  document.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: "open" });
  const modal = document.createElement("div");
  modal.id = "tag-config-modal";
  const input = document.createElement("input");
  input.id = "tags-search";
  const clear = document.createElement("button");
  clear.id = "tags-search-clear";
  const results = document.createElement("ul");
  results.id = "search-results";
  modal.append(input, clear, results);
  shadowRoot.appendChild(modal);
  stateManager.set("shadowRoot", shadowRoot);

  let resultClickListeners = 0;
  const originalAddEventListener = results.addEventListener.bind(results);
  results.addEventListener = (type, listener, options) => {
    if (type === "click") resultClickListeners += 1;
    return originalAddEventListener(type, listener, options);
  };
  initTagSearchListeners();

  return {
    clear,
    input,
    resultClickListeners,
    results,
    shadowRoot,
    tags,
  };
}

export function renderTags(tags) {
  renderList(tags);
}

export function hideResults(results) {
  hideTagSearchResults(results);
}

export function selectedLists() {
  return {
    preferred: [...config.preferredTags],
    excluded: [...config.excludedTags],
    marked: [...config.markedTags],
  };
}

export { TAG_SEARCH_RESULT_CHUNK_SIZE };
