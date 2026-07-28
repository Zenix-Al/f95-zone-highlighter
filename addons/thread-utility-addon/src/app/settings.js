import { getStoredValue } from "../api/storage.js";
import { THREAD_UTILITY_SETTINGS_KEY } from "../constants.js";
import {
  DEFAULT_QUICK_SEARCHES,
  normalizeQuickSearches,
} from "../domain/utilities/quickSearch.js";

export const THREAD_UTILITY_SETTINGS_DEFAULTS = Object.freeze({
  showLauncher: true,
  visibleTagLimit: 8,
  excludedTagMode: "muted",
  openSearchesInNewTab: true,
  searchScope: "thread",
  quickSearches: DEFAULT_QUICK_SEARCHES,
  descriptionPreviewLines: 4,
});

export const THREAD_UTILITY_PANEL_SETTINGS = Object.freeze([
  Object.freeze({
    path: "showLauncher",
    text: "Show thread launcher",
    type: "toggle",
    tooltip: "Show the Thread Utility launcher on supported thread pages.",
  }),
  Object.freeze({
    path: "visibleTagLimit",
    text: "Visible tags",
    type: "number",
    min: 1,
    max: 20,
    step: 1,
    tooltip: "Number of tags shown before the explicit overflow button.",
  }),
  Object.freeze({
    path: "openSearchesInNewTab",
    text: "Open searches in new tab",
    type: "toggle",
    tooltip: "Open quick-search results in a new browser tab.",
  }),
  Object.freeze({
    path: "descriptionPreviewLines",
    text: "Description preview lines",
    type: "number",
    min: 2,
    max: 8,
    step: 1,
    tooltip: "Number of lines shown before Description is expanded.",
  }),
]);

export function normalizeThreadUtilitySettings(value) {
  const candidate = value && typeof value === "object" ? value : {};
  const visibleTagLimit = Number(candidate.visibleTagLimit);
  const descriptionPreviewLines = Number(candidate.descriptionPreviewLines);
  return {
    showLauncher: candidate.showLauncher !== false,
    visibleTagLimit: Number.isFinite(visibleTagLimit)
      ? Math.max(1, Math.min(20, Math.round(visibleTagLimit)))
      : THREAD_UTILITY_SETTINGS_DEFAULTS.visibleTagLimit,
    excludedTagMode: candidate.excludedTagMode === "hidden" ? "hidden" : "muted",
    openSearchesInNewTab: candidate.openSearchesInNewTab !== false,
    searchScope: candidate.searchScope === "global" ? "global" : "thread",
    quickSearches: normalizeQuickSearches(candidate.quickSearches),
    descriptionPreviewLines: Number.isFinite(descriptionPreviewLines)
      ? Math.max(2, Math.min(8, Math.round(descriptionPreviewLines)))
      : THREAD_UTILITY_SETTINGS_DEFAULTS.descriptionPreviewLines,
  };
}

export async function loadThreadUtilitySettings(core) {
  const result = await getStoredValue(
    core,
    THREAD_UTILITY_SETTINGS_KEY,
    THREAD_UTILITY_SETTINGS_DEFAULTS,
  );
  return {
    result,
    settings: normalizeThreadUtilitySettings(
      result?.ok ? result.value : THREAD_UTILITY_SETTINGS_DEFAULTS,
    ),
  };
}
