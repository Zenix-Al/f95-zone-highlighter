/**
 * Event handlers for library manager UI
 * Organized by feature/action type
 */

import { LIBRARY_MANAGER_PAGE_SIZE } from "../constants.js";
import { safeText } from "./helpers.js";
import { showToast } from "./showToast.js";
import { syncLayoutState, renderDetailPanel } from "./renderers.js";
import { handleImportFile, handleExport, handleExportSelected } from "./importExport.js";

export function createHandlers(state, api, deps) {
  const {
    reloadRowsFn,
    onMutatedFn,
    getActiveEntryFn,
    getLiveThreadSnapshotFn,
    closeDialogFn,
    library,
    getRootFn,
    askConfirmFn,
  } = deps;

  // Navigation handlers
  const prevHandler = async () => {
    const root = getRootFn();
    if (state.page > 1) {
      state.page -= 1;
      await reloadRowsFn(root);
    }
  };

  const nextHandler = async () => {
    const root = getRootFn();
    const maxPage = Math.max(1, Math.ceil(state.rows.length / LIBRARY_MANAGER_PAGE_SIZE));
    if (state.page < maxPage) {
      state.page += 1;
      await reloadRowsFn(root);
    }
  };

  // Detail panel handlers
  const detailToggleHandler = () => {
    const root = getRootFn();
    state.detailOpen = !state.detailOpen;
    syncLayoutState(root, state);
    renderDetailPanel(root, state, getActiveEntryFn, getLiveThreadSnapshotFn);
  };

  const detailCloseHandler = () => {
    const root = getRootFn();
    state.detailOpen = false;
    syncLayoutState(root, state);
    renderDetailPanel(root, state, getActiveEntryFn, getLiveThreadSnapshotFn);
  };

  const detailSaveHandler = async () => {
    const root = getRootFn();
    const entry = getActiveEntryFn();
    if (!entry) return;

    const statusField = root.querySelector('[data-field="detail-status"]');
    const scoreField = root.querySelector('[data-field="detail-userScore"]');
    const pinnedField = root.querySelector('[data-field="detail-pinned"]');
    const noteField = root.querySelector('[data-field="detail-note"]');

    const userScoreRaw = String(scoreField?.value || "").trim();
    const userScore = userScoreRaw ? Number(userScoreRaw) : null;
    if (userScoreRaw && (!Number.isFinite(userScore) || userScore < 0 || userScore > 10)) {
      await showToast("User score must be between 0 and 10.", "error");
      return;
    }
    const normalizedUserScore = userScoreRaw ? Number(userScore.toFixed(1)) : null;

    const result = await api.patchEntry(entry.threadId, {
      userStatus: String(statusField?.value || entry.userStatus).trim() || "saved",
      userScore: normalizedUserScore,
      pinned: Boolean(pinnedField?.checked),
      note: String(noteField?.value || "").trim(),
    });

    if (!result?.ok) {
      await showToast(`Failed to save entry: ${result?.reason || "unknown"}`, "error");
      return;
    }

    state.detailOpen = false;
    await showToast("Entry saved.", "success");
    await reloadRowsFn(root);
    if (typeof onMutatedFn === "function") onMutatedFn();
  };

  const detailRevertHandler = () => {
    const root = getRootFn();
    renderDetailPanel(root, state, getActiveEntryFn, getLiveThreadSnapshotFn);
  };

  const detailUpdateThreadHandler = async () => {
    const root = getRootFn();
    const entry = getActiveEntryFn();
    if (!entry) return;

    const snapshot = getLiveThreadSnapshotFn();
    if (!snapshot || snapshot.threadId !== entry.threadId) {
      await showToast("Update is only available on this entry's thread page.", "error");
      return;
    }

    const result = await api.patchEntry(entry.threadId, {
      url: String(snapshot.url || "").trim(),
      title: String(snapshot.title || "").trim(),
      canonicalTitle: String(snapshot.canonicalTitle || snapshot.title || "").trim(),
      titleNormalized: String(snapshot.titleNormalized || snapshot.title || "")
        .trim()
        .toLowerCase(),
      prefix: String(snapshot.prefix || "").trim(),
      gameVersion: String(snapshot.gameVersion || "").trim(),
      tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
      sourcePage: "thread",
    });

    if (!result?.ok) {
      await showToast(`Failed to update entry: ${result?.reason || "unknown"}`, "error");
      return;
    }

    await showToast("Entry refreshed from current thread.", "success");
    await reloadRowsFn(root);
    if (typeof onMutatedFn === "function") onMutatedFn();
  };

  // Row/Entry handlers
  const removeHandler = async (threadId) => {
    const root = getRootFn();
    if (!threadId) return;

    const confirmed = await askConfirmFn(root, {
      title: "Remove Entry",
      message: "Remove this entry from library?",
      confirmText: "Remove",
      cancelText: "Cancel",
      danger: true,
    });

    if (!confirmed) return;

    const result = await api.removeEntry(threadId);
    if (!result?.ok) {
      await showToast("Failed to remove entry.", "error");
      return;
    }

    await showToast("Entry removed from library.", "success");
    await reloadRowsFn(root);
    if (typeof onMutatedFn === "function") onMutatedFn();
  };

  // Selection handlers
  const clearSelectionHandler = async () => {
    const root = getRootFn();
    state.selectedIds = new Set();
    await reloadRowsFn(root);
  };

  const toggleSelectHandler = async (threadId) => {
    const root = getRootFn();
    if (!threadId) return;
    const checkboxes = root.querySelectorAll(
      `input[data-action="toggle-select"][data-thread-id="${threadId}"]`,
    );
    if (checkboxes.length > 0 && checkboxes[0].checked) {
      state.selectedIds.add(threadId);
    } else {
      state.selectedIds.delete(threadId);
    }
    await reloadRowsFn(root);
  };

  const toggleAllHandler = async () => {
    const root = getRootFn();
    const from = (state.page - 1) * LIBRARY_MANAGER_PAGE_SIZE;
    const pageRows = state.rows.slice(from, from + LIBRARY_MANAGER_PAGE_SIZE);
    const pageIds = pageRows.map((row) => row.threadId);
    const toggleAllCheckbox = root.querySelector('[data-action="toggle-all"]');

    if (toggleAllCheckbox?.checked) {
      pageIds.forEach((id) => state.selectedIds.add(id));
    } else {
      pageIds.forEach((id) => state.selectedIds.delete(id));
    }
    await reloadRowsFn(root);
  };

  // Bulk operation handlers
  const bulkSetStatusHandler = async () => {
    const root = getRootFn();
    const ids = [...state.selectedIds];
    if (ids.length === 0) {
      await showToast("Select at least one row first.", "error");
      return;
    }

    const bulkStatusEl = root.querySelector('[data-field="bulkStatus"]');
    const nextStatus = String(bulkStatusEl?.value || "saved").trim();
    const result = await api.bulkUpdateStatus(ids, nextStatus);

    await showToast(
      `Bulk status updated: ${result.updated}, skipped: ${result.skipped}.`,
      "success",
    );
    await reloadRowsFn(root);
    if (typeof onMutatedFn === "function") onMutatedFn();
  };

  const bulkRemoveHandler = async () => {
    const root = getRootFn();
    const ids = [...state.selectedIds];
    if (ids.length === 0) {
      await showToast("Select at least one row first.", "error");
      return;
    }

    const confirmed = await askConfirmFn(root, {
      title: "Remove Selected",
      message: `Remove ${ids.length} selected entries? This cannot be undone.`,
      confirmText: "Remove",
      cancelText: "Cancel",
      danger: true,
    });

    if (!confirmed) return;

    const result = await api.bulkRemoveEntries(ids);
    await showToast(`Bulk removed: ${result.removed}, skipped: ${result.skipped}.`, "success");

    state.selectedIds = new Set();
    await reloadRowsFn(root);
    if (typeof onMutatedFn === "function") onMutatedFn();
  };

  // Export handlers
  const exportHandler = async () => {
    await handleExport(root, state, library, false);
  };

  const exportSelectedHandler = async () => {
    await handleExportSelected(root, state);
  };

  // Import handler
  const importHandler = () => {
    const importInput = root.querySelector('[data-field="importFile"]');
    importInput?.click();
  };

  // Dialog close
  const closeHandler = async () => {
    await closeDialogFn("addon-close");
  };

  return {
    // Navigation
    prev: prevHandler,
    next: nextHandler,

    // Detail panel
    "toggle-detail": detailToggleHandler,
    "detail-close": detailCloseHandler,
    "detail-save": detailSaveHandler,
    "detail-revert": detailRevertHandler,
    "detail-update-thread": detailUpdateThreadHandler,

    // Row operations
    remove: removeHandler,

    // Selection
    "clear-selection": clearSelectionHandler,
    "toggle-select": toggleSelectHandler,
    "toggle-all": toggleAllHandler,

    // Bulk operations
    "bulk-set-status": bulkSetStatusHandler,
    "bulk-remove": bulkRemoveHandler,

    // Export/Import
    export: exportHandler,
    "export-selected": exportSelectedHandler,
    import: importHandler,

    // Dialog
    close: closeHandler,
  };
}
