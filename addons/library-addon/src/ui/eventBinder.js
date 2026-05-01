/**
 * Event binding and delegation setup
 * Wires up all event listeners for the dialog
 */

import { LIBRARY_MANAGER_PAGE_SIZE } from "../constants.js";
import { safeText } from "./helpers.js";
import { showToast } from "./showToast.js";
import { reloadRows } from "./dataOps.js";
import { handleImportFile } from "./importExport.js";

const SEARCH_DEBOUNCE_MS = 220;

export function bindEvents(root, state, handlers, deps) {
  const { reloadRowsFn, onMutatedFn, library, askConfirmFn } = deps;

  // Button click handler
  root.addEventListener("click", async (event) => {
    const button = event.target?.closest?.("button[data-action]");
    if (!button) return;

    const action = String(button.dataset.action || "").trim();
    const threadId = String(button.dataset.threadId || "").trim();

    if (action === "remove" && threadId) {
      await handlers.remove(threadId);
    } else if (handlers[action]) {
      await handlers[action]();
    }
  });

  // Checkbox/input change handler
  root.addEventListener("change", async (event) => {
    const actionEl = event.target?.closest?.("input[data-action]");
    if (!actionEl) return;

    const action = String(actionEl.dataset.action || "").trim();

    if (action === "toggle-select") {
      const threadId = String(actionEl.dataset.threadId || "").trim();
      if (threadId) {
        await handlers["toggle-select"](threadId);
      }
    } else if (action === "toggle-all") {
      await handlers["toggle-all"]();
    }
  });

  // Table row click handler (for detail selection)
  root.addEventListener("click", async (event) => {
    const row = event.target?.closest?.("tbody[data-role='rows'] tr[data-thread-id]");
    if (!row) return;

    // Don't trigger if clicking on interactive elements
    if (
      event.target?.closest?.("button") ||
      event.target?.closest?.("a") ||
      event.target?.closest?.("input[type='checkbox']")
    ) {
      return;
    }

    const threadId = String(row.dataset.threadId || "").trim();
    if (!threadId) return;

    state.activeId = threadId;
    state.detailOpen = true;

    // These will be called from renderDetailPanel in the actual handler
    deps.renderDetailPanelFn();
    await reloadRowsFn(root);
  });

  // Close advanced panel when clicking outside
  const advancedPanel = root.querySelector(".f95ue-library-more-actions");
  root.addEventListener("click", (event) => {
    if (
      advancedPanel?.hasAttribute("open") &&
      !event.target?.closest?.(".f95ue-library-more-actions")
    ) {
      advancedPanel.removeAttribute("open");
    }
  });

  // Search input with debounce
  const searchInput = root.querySelector('[data-field="search"]');
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const nextSearch = String(searchInput.value || "").trim();
      if (state.searchDebounceTimer) {
        window.clearTimeout(state.searchDebounceTimer);
      }
      state.searchDebounceTimer = window.setTimeout(async () => {
        state.search = nextSearch;
        state.page = 1;
        await reloadRowsFn(root);
      }, SEARCH_DEBOUNCE_MS);
    });
  }

  // Status filter
  const statusSelect = root.querySelector('[data-field="status"]');
  if (statusSelect) {
    statusSelect.addEventListener("change", async () => {
      state.status = String(statusSelect.value || "all").trim();
      state.page = 1;
      await reloadRowsFn(root);
    });
  }

  // Sort selection
  const sortSelect = root.querySelector('[data-field="sort"]');
  if (sortSelect) {
    sortSelect.addEventListener("change", async () => {
      const pair = String(sortSelect.value || "updatedAt:desc").split(":");
      state.sortBy = String(pair[0] || "updatedAt").trim();
      state.sortDir = String(pair[1] || "desc").trim();
      state.page = 1;
      await reloadRowsFn(root);
    });
  }

  // Import file input
  const importInput = root.querySelector('[data-field="importFile"]');
  if (importInput) {
    importInput.addEventListener("change", async () => {
      await handleImportFile(
        importInput,
        root,
        state,
        library,
        reloadRowsFn,
        onMutatedFn,
        askConfirmFn,
      );
    });
  }
}
