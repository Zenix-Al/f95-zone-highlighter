/**
 * Data loading and filtering operations
 * Handles library queries and state synchronization
 */

import { LIBRARY_MANAGER_PAGE_SIZE } from "../../constants.js";
import { renderRows, updatePageInfo, updateStatusLine } from "../components/manager/tableRenderer.js";
import { parseSearchQuery, matchesSearchTokens } from "../utils/searchTokens.js";
import { buildTagChipItems } from "../utils/tagViewModel.js";

export async function reloadRows(root, state, api, library, ROWS_STATUS_ID) {
  const tbody = root.querySelector('[data-role="rows"]');
  const statusLine = root.querySelector(`#${ROWS_STATUS_ID}`);

  if (!tbody || !statusLine) return;

  const parsedSearch = parseSearchQuery(state.search);
  let loadSucceeded = true;
  state.isLoading = true;
  state.errorMessage = "";

  statusLine.classList.remove("error");
  statusLine.textContent = "Loading library...";

  try {
    const rows = await api.queryEntries({
      search: parsedSearch.text,
      status: state.status,
      sortBy: state.sortBy,
      sortDir: state.sortDir,
      limit: 5000,
      offset: 0,
    });

    const incomingRows = Array.isArray(rows) ? rows : [];
    state.rows = parsedSearch.tokens.length
      ? incomingRows.filter((entry) => matchesSearchTokens(entry, parsedSearch.tokens))
      : incomingRows;
  } catch (error) {
    loadSucceeded = false;
    state.errorMessage = String(error?.message || "Failed to load library.");
  }

  state.isLoading = false;

  // Clean up selections
  const availableIds = new Set(state.rows.map((entry) => entry.threadId));
  state.selectedIds = new Set([...state.selectedIds].filter((id) => availableIds.has(id)));
  if (state.editingNoteId && !availableIds.has(state.editingNoteId)) state.editingNoteId = "";

  // Handle pagination
  const pageSize = Math.max(1, Number(state.pageSize || LIBRARY_MANAGER_PAGE_SIZE));
  const maxPage = Math.max(1, Math.ceil(state.rows.length / pageSize));
  if (state.page > maxPage) {
    state.page = maxPage;
  }

  // Render current page
  const from = (state.page - 1) * pageSize;
  const pageRows = state.rows.slice(from, from + pageSize);

  renderRows(tbody, pageRows, state.selectedIds, state, {
    tagConfig: state.tagConfig,
    tagItemsForEntry: (entry) => buildTagChipItems(entry?.tags, state.tagConfig),
  });
  updatePageInfo(root, state);
  updateStatusLine(root, state, ROWS_STATUS_ID);
  return loadSucceeded;
}

export function setupLoadingUI(root, state, ROWS_STATUS_ID) {
  const statusLine = root.querySelector(`#${ROWS_STATUS_ID}`);
  if (statusLine) {
    statusLine.classList.remove("error");
    statusLine.textContent = "Loading library...";
  }
}
