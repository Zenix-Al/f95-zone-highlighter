/**
 * State management for library manager
 * Centralizes all mutable state in one place
 */

export function createInitialState() {
  return {
    search: "",
    status: "all",
    sortBy: "updatedAt",
    sortDir: "desc",
    page: 1,
    rows: [],
    selectedIds: new Set(),
    activeId: "",
    detailOpen: false,
    isLoading: false,
    errorMessage: "",
  };
}

export function createAppContext() {
  return {
    dialogRoot: null,
    dialogOpen: false,
    searchDebounceTimer: 0,
  };
}
