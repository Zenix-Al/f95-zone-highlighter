/**
 * Data loading and filtering operations
 * Handles library queries and state synchronization
 */

import { LIBRARY_MANAGER_PAGE_SIZE } from "../constants.js";
import { parseSearchQuery, matchesSearchTokens, safeText } from "./helpers.js";
import { renderRows, updatePageInfo, updateStatusLine } from "./renderers.js";

export async function reloadRows(root, state, api, library, ROWS_STATUS_ID) {
  const tbody = root.querySelector('[data-role="rows"]');
  const statusLine = root.querySelector(`#${ROWS_STATUS_ID}`);

  if (!tbody || !statusLine) return;

  const parsedSearch = parseSearchQuery(state.search);
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
    state.rows = [];
    state.errorMessage = String(error?.message || "Failed to load library.");
  }

  state.isLoading = false;

  // Clean up selections
  const availableIds = new Set(state.rows.map((entry) => entry.threadId));
  state.selectedIds = new Set([...state.selectedIds].filter((id) => availableIds.has(id)));

  if (state.activeId && !availableIds.has(state.activeId)) {
    state.activeId = "";
  }

  // Handle pagination
  const maxPage = Math.max(1, Math.ceil(state.rows.length / LIBRARY_MANAGER_PAGE_SIZE));
  if (state.page > maxPage) {
    state.page = maxPage;
  }

  // Render current page
  const from = (state.page - 1) * LIBRARY_MANAGER_PAGE_SIZE;
  const pageRows = state.rows.slice(from, from + LIBRARY_MANAGER_PAGE_SIZE);

  renderRows(tbody, pageRows, state.selectedIds, state.activeId);
  updatePageInfo(root, state);
  updateStatusLine(root, state, ROWS_STATUS_ID);
}

export function setupLoadingUI(root, state, ROWS_STATUS_ID) {
  const statusLine = root.querySelector(`#${ROWS_STATUS_ID}`);
  if (statusLine) {
    statusLine.classList.remove("error");
    statusLine.textContent = "Loading library...";
  }
}
