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
    pageCursors: [null],
    nextCursor: null,
    hasNextPage: false,
    totalRows: null,
    paginationMode: "keyset",
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

    ratingDraftById: new Map(),
    ratingCommittedById: new Map(),
    ratingSaveTimers: new Map(),
    ratingCommitChains: new Map(),
    ratingRevisionById: new Map(),
    ratingGeneration: 0,
  };
}

export function resetPagination(state) {
  state.page = 1;
  state.pageCursors = [null];
  state.nextCursor = null;
  state.hasNextPage = false;
  state.totalRows = null;
}

export function createAppContext() {
  return {
    dialogRoot: null,
    dialogOpen: false,
    searchDebounceTimer: 0,
  };
}
