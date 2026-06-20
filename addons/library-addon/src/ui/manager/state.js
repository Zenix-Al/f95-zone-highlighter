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
    pageSize: 50,
    rows: [],
    selectedIds: new Set(),
    isLoading: false,
    errorMessage: "",
    tagConfig: null,

    liveThreadId: "",
    openStatusMenuId: "",
    openRowMenuId: "",

    editingNoteId: "",
    noteDraftById: new Map(),
    noteSaveTimers: new Map(),
  };
}

export function createAppContext() {
  return {
    dialogRoot: null,
    dialogOpen: false,
    searchDebounceTimer: 0,
  };
}
