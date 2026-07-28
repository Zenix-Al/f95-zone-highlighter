import {
  DEFAULT_QUICK_SEARCHES,
  QUICK_SEARCH_LIMIT,
  normalizeQuickSearches,
} from "../utilities/quickSearch.js";

function cloneUtilities(value) {
  return normalizeQuickSearches(value).map((entry) => ({ ...entry }));
}

export function createSettingsDraft(settings) {
  return {
    searchScope: settings?.searchScope === "global" ? "global" : "thread",
    excludedTagMode: settings?.excludedTagMode === "hidden" ? "hidden" : "muted",
    quickSearches: cloneUtilities(settings?.quickSearches),
  };
}

export function resetSettingsDraft() {
  return {
    searchScope: "thread",
    excludedTagMode: "muted",
    quickSearches: cloneUtilities(DEFAULT_QUICK_SEARCHES),
  };
}

export function addDraftUtility(draft) {
  if (draft.quickSearches.length >= QUICK_SEARCH_LIMIT) return false;
  const suffix = draft.quickSearches.length + 1;
  draft.quickSearches.push({
    id: `custom-${suffix}`,
    label: `Utility ${suffix}`,
    query: "",
    includeTitle: true,
    enabled: true,
    order: draft.quickSearches.length,
  });
  return true;
}

export function moveDraftUtility(draft, index, offset) {
  const target = index + offset;
  if (index < 0 || target < 0 || target >= draft.quickSearches.length) return false;
  const [entry] = draft.quickSearches.splice(index, 1);
  draft.quickSearches.splice(target, 0, entry);
  draft.quickSearches.forEach((item, order) => { item.order = order; });
  return true;
}

export function deleteDraftUtility(draft, index) {
  if (index < 0 || index >= draft.quickSearches.length) return false;
  draft.quickSearches.splice(index, 1);
  draft.quickSearches.forEach((item, order) => { item.order = order; });
  return true;
}

export function validateSettingsDraft(draft) {
  const issues = [];
  if (!["thread", "global"].includes(draft?.searchScope)) issues.push("searchScope");
  if (!["muted", "hidden"].includes(draft?.excludedTagMode)) issues.push("excludedTagMode");
  const source = Array.isArray(draft?.quickSearches) ? draft.quickSearches : [];
  if (source.length > QUICK_SEARCH_LIMIT) issues.push("quickSearches");
  for (const [index, entry] of source.entries()) {
    const label = String(entry?.label || "").replace(/\s+/g, " ").trim();
    const query = String(entry?.query || "").replace(/\s+/g, " ").trim();
    if (!label || label.length > 40) issues.push(`quickSearches.${index}.label`);
    if (!query || query.length > 120) issues.push(`quickSearches.${index}.query`);
  }
  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    value: {
      searchScope: draft.searchScope,
      excludedTagMode: draft.excludedTagMode,
      quickSearches: normalizeQuickSearches(source),
    },
  };
}
