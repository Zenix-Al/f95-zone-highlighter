import { config, debug, state } from "../constants";
import { saveConfigKeys } from "../storage/save";
import { showToast } from "../ui/modal";

export function renderList(filteredTags) {
  const results = document.getElementById("search-results");
  const input = document.getElementById("tags-search");
  if (!results || !input) return;
  results.innerHTML = "";

  // remove already selected tags
  const visibleTags = filteredTags.filter(
    (tag) => !config.preferredTags.includes(tag.id) && !config.excludedTags.includes(tag.id)
  );

  if (visibleTags.length === 0) {
    results.style.display = "none";
    return;
  }

  visibleTags.forEach((tag) => {
    const li = document.createElement("li");
    li.classList.add("search-result-item");
    li.style.display = "flex";
    li.style.justifyContent = "space-between";
    li.style.alignItems = "center";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = tag.name;

    const buttonsContainer = document.createElement("div");
    buttonsContainer.style.display = "flex";
    buttonsContainer.style.gap = "5px";

    // Preferred button
    const preferredBtn = document.createElement("button");
    preferredBtn.textContent = "✓";
    preferredBtn.title = "Add to preferred";
    preferredBtn.classList.add("tag-btn", "preferred");
    preferredBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      config.preferredTags.push(tag.id);
      renderPreferred();
      state.reapplyOverlay = true;
      input.value = "";
      results.style.display = "none";
      showToast(`${tag.name} added to preferred`);
      saveConfigKeys({ preferredTags: config.preferredTags });
    });

    // Excluded button
    const excludedBtn = document.createElement("button");
    excludedBtn.textContent = "✗";
    excludedBtn.title = "Add to excluded";
    excludedBtn.classList.add("tag-btn", "excluded");
    excludedBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      config.excludedTags.push(tag.id);
      renderExcluded();
      state.reapplyOverlay = true;
      input.value = "";
      results.style.display = "none";
      showToast(`${tag.name} added to exclusion`);
      saveConfigKeys({ excludedTags: config.excludedTags });
    });

    buttonsContainer.appendChild(preferredBtn);
    buttonsContainer.appendChild(excludedBtn);

    li.appendChild(nameSpan);
    li.appendChild(buttonsContainer);
    results.appendChild(li);
  });

  results.style.display = "block";
}

// --- Render preferred tags ---
export function renderPreferred() {
  const preferredContainer = document.getElementById("preffered-tags-list");
  if (!preferredContainer) return;
  preferredContainer.innerHTML = "";
  config.preferredTags.forEach((id, index) => {
    const tag = config.tags.find((t) => t.id === id);
    if (!tag) return;

    const item = document.createElement("div");
    item.classList.add("preferred-tag-item");

    const text = document.createElement("span");
    text.textContent = tag.name;

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "X";
    removeBtn.classList.add("preferred-tag-remove");
    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.reapplyOverlay = true;
      config.preferredTags.splice(index, 1);
      renderPreferred();
      showToast(`${tag.name} removed from preffered`);

      saveConfigKeys({ preferredTags: config.preferredTags });
    });

    item.appendChild(text);
    item.appendChild(removeBtn);
    preferredContainer.appendChild(item);
  });
}

// --- Render excluded tags ---
export function renderExcluded() {
  const excludedContainer = document.getElementById("excluded-tags-list");
  if (!excludedContainer) return;
  excludedContainer.innerHTML = "";
  config.excludedTags.forEach((id, index) => {
    const tag = config.tags.find((t) => t.id === id);
    if (!tag) return;

    const item = document.createElement("div");
    item.classList.add("excluded-tag-item");

    const text = document.createElement("span");
    text.textContent = tag.name;

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "X";
    removeBtn.classList.add("excluded-tag-remove");

    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      config.excludedTags.splice(index, 1);
      state.reapplyOverlay = true;
      renderExcluded();
      showToast(`${tag.name} removed from exclusion`);

      saveConfigKeys({ excludedTags: config.excludedTags });
    });

    item.appendChild(text);
    item.appendChild(removeBtn);
    excludedContainer.appendChild(item);
  });
}
