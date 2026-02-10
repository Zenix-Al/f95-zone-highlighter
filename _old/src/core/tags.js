import { config } from "../constants";
import { renderList } from "./renderer/searchTags";

export function updateSearch(event) {
  const query = event.target.value.trim().toLowerCase();
  const results = document.getElementById("search-results");

  if (!query || !results) {
    if (results) results.style.display = "none";
    return;
  }

  const filteredTags = config.tags.filter((tag) => tag.name.toLowerCase().includes(query));

  renderList(filteredTags);
}
export function showAllTags() {
  const results = document.getElementById("search-results");
  if (!results) return;
  renderList(config.tags);
  results.style.display = "block";
}
