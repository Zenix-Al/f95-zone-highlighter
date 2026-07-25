/**
 * Data loading and filtering operations
 * Handles library queries and state synchronization
 */

import { renderRows, updatePageInfo, updateStatusLine } from "../components/manager/tableRenderer.js";
import { parseSearchQuery, matchesSearchTokens } from "../utils/searchTokens.js";
import { buildTagChipItems } from "../utils/tagViewModel.js";

export async function reloadRows(root, state, api, library, ROWS_STATUS_ID) {
  state.ratingGeneration += 1;
  for (const timer of state.ratingSaveTimers?.values?.() || []) window.clearTimeout(timer);
  state.ratingSaveTimers?.clear?.();
  state.ratingCommitChains?.clear?.();
  const tbody = root.querySelector('[data-role="rows"]');
  const statusLine = root.querySelector(`#${ROWS_STATUS_ID}`);

  if (!tbody || !statusLine) return;

  const parsedSearch = parseSearchQuery(state.search);
  let loadSucceeded = true;
  state.isLoading = true;
  state.errorMessage = "";

  statusLine.classList.remove("error");
  statusLine.classList.add("is-loading");
  statusLine.textContent = "Loading library...";

  try {
    const pageResult = await api.queryEntriesPage({
      search: parsedSearch.text,
      status: state.status,
      sortBy: state.sortBy,
      sortDir: state.sortDir,
      limit: state.pageSize,
      page: state.page,
      cursor: state.pageCursors[state.page - 1] || null,
      matchesRecord:
        parsedSearch.tokens.length > 0
          ? (entry) => matchesSearchTokens(entry, parsedSearch.tokens)
          : undefined,
    });

    state.rows = Array.isArray(pageResult?.rows) ? pageResult.rows : [];
    state.nextCursor = pageResult?.nextCursor || null;
    state.hasNextPage = Boolean(pageResult?.hasNext);
    state.totalRows = Number.isFinite(pageResult?.totalRows)
      ? Number(pageResult.totalRows)
      : null;
    state.paginationMode = String(pageResult?.mode || "keyset");
  } catch (error) {
    loadSucceeded = false;
    state.errorMessage = String(error?.message || "Failed to load library.");
  }

  state.isLoading = false;
  statusLine.classList.remove("is-loading");

  const visibleIds = new Set(state.rows.map((entry) => entry.threadId));
  if (state.editingNoteId && !visibleIds.has(state.editingNoteId)) state.editingNoteId = "";

  renderRows(tbody, state.rows, state.selectedIds, state, {
    tagConfig: state.tagConfig,
    tagItemsForEntry: (entry) => buildTagChipItems(entry?.thread?.tags, state.tagConfig),
  });
  updatePageInfo(root, state);
  updateStatusLine(root, state, ROWS_STATUS_ID);
  return loadSucceeded;
}

export function setupLoadingUI(root, state, ROWS_STATUS_ID) {
  const statusLine = root.querySelector(`#${ROWS_STATUS_ID}`);
  if (statusLine) {
    statusLine.classList.remove("error");
    statusLine.classList.add("is-loading");
    statusLine.textContent = "Loading library...";
  }
}
