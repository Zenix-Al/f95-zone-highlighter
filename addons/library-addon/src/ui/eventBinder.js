/**
 * Event binding and delegation setup
 * Wires up all event listeners for the dialog
 */

import { handleImportFile } from "./importExport.js";

const SEARCH_DEBOUNCE_MS = 220;
export function bindEvents(root, state, handlers, deps) {
  const { reloadRowsFn, onMutatedFn, library, askConfirmFn } = deps;

  function shouldFlipTooltip(anchorEl, tooltipEl) {
    if (!anchorEl || !tooltipEl) return false;
    const wrap = root.querySelector(".f95ue-library-table-wrap") || root;
    const wrapRect = wrap.getBoundingClientRect();
    const rect = anchorEl.getBoundingClientRect();

    // Make tooltip measurable.
    const prevDisplay = tooltipEl.style.display;
    const prevVisibility = tooltipEl.style.visibility;
    tooltipEl.style.display = "inline-flex";
    tooltipEl.style.visibility = "hidden";
    const tipRect = tooltipEl.getBoundingClientRect();
    tooltipEl.style.display = prevDisplay;
    tooltipEl.style.visibility = prevVisibility;

    const spaceBelow = wrapRect.bottom - rect.bottom;
    const spaceAbove = rect.top - wrapRect.top;
    return spaceBelow < tipRect.height + 16 && spaceAbove > spaceBelow;
  }

  // Button click handler
  root.addEventListener("click", async (event) => {
    // Close menus when clicking outside them.
    if (
      state.openStatusMenuId &&
      !event.target?.closest?.(".f95ue-status-field") &&
      handlers["status-menu-close"]
    ) {
      await handlers["status-menu-close"]();
    }
    if (
      state.openRowMenuId &&
      !event.target?.closest?.(".f95ue-row-menu") &&
      handlers["row-menu-close"]
    ) {
      await handlers["row-menu-close"]();
    }

    const button = event.target?.closest?.("button[data-action]");
    if (!button) return;

    const action = String(button.dataset.action || "").trim();
    const threadId = String(button.dataset.threadId || "").trim();
    const value = button.dataset.value;

    if (button.disabled) return;

    if (action === "remove" && threadId) {
      await handlers.remove(threadId);
    } else if (handlers[action]) {
      await handlers[action](threadId, value, button);
    }
  });

  // Checkbox/input change handler
  root.addEventListener("change", async (event) => {
    const actionEl = event.target?.closest?.("input[data-action]");
    if (actionEl) {
      const action = String(actionEl.dataset.action || "").trim();

      if (action === "toggle-select") {
        const threadId = String(actionEl.dataset.threadId || "").trim();
        if (threadId) {
          await handlers["toggle-select"](threadId);
        }
      } else if (action === "toggle-all") {
        await handlers["toggle-all"]();
      }
      return;
    }

    const selectEl = event.target?.closest?.("select[data-action]");
    if (!selectEl) return;

    const action = String(selectEl.dataset.action || "").trim();
    const threadId = String(selectEl.dataset.threadId || "").trim();
    if (handlers[action]) {
      await handlers[action](threadId, selectEl.value, selectEl);
    }
  });

  root.addEventListener("input", async (event) => {
    const noteEl = event.target?.closest?.("textarea[data-action]");
    if (!noteEl) return;
    const action = String(noteEl.dataset.action || "").trim();
    if (action !== "note-input") return;
    const threadId = String(noteEl.dataset.threadId || "").trim();
    if (!threadId) return;
    if (handlers[action]) {
      await handlers[action](threadId, noteEl.value, noteEl);
    }
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

  // Tooltip flip handling (chips + note preview)
  root.addEventListener("pointerenter", (event) => {
    const chipList = event.target?.closest?.(".f95ue-chip-list");
    if (chipList) {
      const tooltip = chipList.querySelector(".f95ue-chip-tooltip");
      chipList.classList.toggle("is-flip", shouldFlipTooltip(chipList, tooltip));
      return;
    }
    const hoverText = event.target?.closest?.(".f95ue-hover-text");
    if (hoverText) {
      const tooltip = hoverText.querySelector(".f95ue-hover-tooltip");
      hoverText.classList.toggle("is-flip", shouldFlipTooltip(hoverText, tooltip));
    }
  }, true);

  root.addEventListener(
    "scroll",
    () => {
      root.querySelectorAll(".f95ue-chip-list.is-flip").forEach((el) => el.classList.remove("is-flip"));
      root.querySelectorAll(".f95ue-hover-text.is-flip").forEach((el) => el.classList.remove("is-flip"));
    },
    true,
  );
}
