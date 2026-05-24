/**
 * Event handlers for library manager UI
 * Organized by feature/action type
 */

import { LIBRARY_MANAGER_PAGE_SIZE } from "../constants.js";
import { showToast } from "./showToast.js";
import { handleExport, handleExportSelected } from "./importExport.js";

const NOTE_SAVE_DEBOUNCE_MS = 650;

export function createHandlers(state, api, deps) {
  const {
    reloadRowsFn,
    onMutatedFn,
    closeDialogFn,
    library,
    getRootFn,
    askConfirmFn,
    getLiveThreadSnapshotFn,
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
    const pageSize = Math.max(1, Number(state.pageSize || LIBRARY_MANAGER_PAGE_SIZE));
    const maxPage = Math.max(1, Math.ceil(state.rows.length / pageSize));
    if (state.page < maxPage) {
      state.page += 1;
      await reloadRowsFn(root);
    }
  };

  function findEntryById(threadId) {
    const id = String(threadId || "").trim();
    if (!id) return null;
    return state.rows.find((row) => String(row?.threadId || "").trim() === id) || null;
  }

  async function saveNoteNow(threadId) {
    const id = String(threadId || "").trim();
    if (!id) return { ok: false, reason: "thread_id_required" };

    const draft =
      state.noteDraftById && typeof state.noteDraftById.get === "function"
        ? String(state.noteDraftById.get(id) ?? "")
        : "";

    const result = await api.patchEntry(id, { note: draft });
    if (!result?.ok) {
      await showToast(`Failed to save note: ${result?.reason || "unknown"}`, "error");
      return result;
    }
    return result;
  }

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
      await showToast("Failed to Remove entry.", "error");
      return;
    }

    await showToast("Entry Removed from library.", "success");
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
    const pageSize = Math.max(1, Number(state.pageSize || LIBRARY_MANAGER_PAGE_SIZE));
    const from = (state.page - 1) * pageSize;
    const pageRows = state.rows.slice(from, from + pageSize);
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

  const bulkSetPinHandler = async () => {
    const root = getRootFn();
    const ids = [...state.selectedIds];
    if (ids.length === 0) {
      await showToast("Select at least one row first.", "error");
      return;
    }

    const bulkPinEl = root.querySelector('[data-field="bulkPin"]');
    const mode = String(bulkPinEl?.value || "pin")
      .trim()
      .toLowerCase();
    const pinned = mode !== "unpin";

    let updated = 0;
    let skipped = 0;
    for (const id of ids) {
      const result = await api.patchEntry(id, { pinned });
      if (result?.ok) updated += 1;
      else skipped += 1;
    }

    await showToast(`Bulk pin updated: ${updated}, skipped: ${skipped}.`, "success");
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
    await showToast(`Bulk Remove: ${result.removed}, skipped: ${result.skipped}.`, "success");

    state.selectedIds = new Set();
    await reloadRowsFn(root);
    if (typeof onMutatedFn === "function") onMutatedFn();
  };

  // Export handlers
  const exportHandler = async () => {
    const root = getRootFn();
    await handleExport(root, state, library, false);
  };

  const exportSelectedHandler = async () => {
    const root = getRootFn();
    await handleExportSelected(root, state);
  };

  // Import handler
  const importHandler = () => {
    const root = getRootFn();
    const importInput = root.querySelector('[data-field="importFile"]');
    importInput?.click();
  };

  // Dialog close
  const closeHandler = async () => {
    await closeDialogFn("addon-close");
  };

  const setStatusHandler = async (threadId, nextStatusRaw) => {
    const root = getRootFn();
    const threadIdClean = String(threadId || "").trim();
    const nextStatus = String(nextStatusRaw || "")
      .trim()
      .toLowerCase();
    if (!threadIdClean) return;
    if (!["saved", "playing", "completed", "dropped"].includes(nextStatus)) return;

    const result = await api.patchEntry(threadIdClean, { userStatus: nextStatus });
    if (!result?.ok) {
      await showToast(`Failed to update status: ${result?.reason || "unknown"}`, "error");
      return;
    }

    state.openStatusMenuId = "";
    await reloadRowsFn(root);
    if (typeof onMutatedFn === "function") onMutatedFn();
  };

  const statusMenuToggleHandler = async (threadId) => {
    const root = getRootFn();
    const id = String(threadId || "").trim();
    state.openStatusMenuId = state.openStatusMenuId === id ? "" : id;
    if (state.openStatusMenuId) state.openRowMenuId = "";
    await reloadRowsFn(root);
  };

  const statusMenuCloseHandler = async () => {
    const root = getRootFn();
    if (!state.openStatusMenuId) return;
    state.openStatusMenuId = "";
    await reloadRowsFn(root);
  };

  const rowMenuToggleHandler = async (threadId) => {
    const root = getRootFn();
    const id = String(threadId || "").trim();
    state.openRowMenuId = state.openRowMenuId === id ? "" : id;
    if (state.openRowMenuId) state.openStatusMenuId = "";
    await reloadRowsFn(root);
  };

  const rowMenuCloseHandler = async () => {
    const root = getRootFn();
    if (!state.openRowMenuId) return;
    state.openRowMenuId = "";
    await reloadRowsFn(root);
  };

  const rowUpdateThreadHandler = async (threadId) => {
    const root = getRootFn();
    const entryId = String(threadId || "").trim();
    if (!entryId) return;

    const snapshot =
      typeof getLiveThreadSnapshotFn === "function" ? getLiveThreadSnapshotFn() : null;

    if (!snapshot?.threadId || snapshot.threadId !== entryId) {
      await showToast("Open this entry's thread page to enable update.", "error");
      return;
    }

    const result = await api.patchEntry(entryId, {
      url: String(snapshot.url || "").trim(),
      title: String(snapshot.title || "").trim(),
      canonicalTitle: String(snapshot.canonicalTitle || snapshot.title || "").trim(),
      titleNormalized: String(snapshot.titleNormalized || snapshot.title || "")
        .trim()
        .toLowerCase(),
      prefix: String(snapshot.prefix || "").trim(),
      gameVersion: String(snapshot.gameVersion || "").trim(),
      prefixes: Array.isArray(snapshot.prefixes) ? snapshot.prefixes : [],
      developer: String(snapshot.developer || "").trim(),
      threadRating: Number.isFinite(Number(snapshot.threadRating)) ? Number(snapshot.threadRating) : null,
      tags: Array.isArray(snapshot.tags) ? snapshot.tags : [],
      sourcePage: "thread",
    });

    if (!result?.ok) {
      await showToast(`Failed to update entry: ${result?.reason || "unknown"}`, "error");
      return;
    }

    state.openRowMenuId = "";
    await showToast("Entry updated from this thread.", "success");
    await reloadRowsFn(root);
    if (typeof onMutatedFn === "function") onMutatedFn();
  };

  const editNoteHandler = async (threadId) => {
    const root = getRootFn();
    const id = String(threadId || "").trim();
    if (!id) return;
    const entry = findEntryById(id);
    if (state.noteDraftById && typeof state.noteDraftById.set === "function") {
      state.noteDraftById.set(id, String(entry?.note ?? ""));
    }
    state.editingNoteId = id;
    await reloadRowsFn(root);
    window.setTimeout(() => {
      root
        .querySelector(`textarea[data-action="note-input"][data-thread-id="${CSS.escape(id)}"]`)
        ?.focus();
    }, 0);
  };

  const noteInputHandler = async (threadId, value) => {
    const id = String(threadId || "").trim();
    if (!id) return;
    const nextValue = String(value ?? "");

    if (state.noteDraftById && typeof state.noteDraftById.set === "function") {
      state.noteDraftById.set(id, nextValue);
    }

    const prevTimer = state.noteSaveTimers?.get?.(id);
    if (prevTimer) window.clearTimeout(prevTimer);

    const timer = window.setTimeout(async () => {
      state.noteSaveTimers?.delete?.(id);
      await saveNoteNow(id);
      if (typeof onMutatedFn === "function") onMutatedFn();
    }, NOTE_SAVE_DEBOUNCE_MS);
    state.noteSaveTimers?.set?.(id, timer);
  };

  const noteDoneHandler = async (threadId) => {
    const root = getRootFn();
    const id = String(threadId || "").trim();
    if (!id) return;

    const prevTimer = state.noteSaveTimers?.get?.(id);
    if (prevTimer) {
      window.clearTimeout(prevTimer);
      state.noteSaveTimers?.delete?.(id);
      await saveNoteNow(id);
      if (typeof onMutatedFn === "function") onMutatedFn();
    }

    state.editingNoteId = "";
    await reloadRowsFn(root);
  };

  const copyDeveloperHandler = async (_threadId, _value, buttonEl) => {
    const text = String(buttonEl?.dataset?.copyText || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      await showToast("Copied developer.", "success");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        await showToast("Copied developer.", "success");
      } catch {
        await showToast("Failed to copy.", "error");
      }
    }
  };

  return {
    // Navigation
    prev: prevHandler,
    next: nextHandler,

    // Row operations
    remove: removeHandler,
    "row-menu-toggle": rowMenuToggleHandler,
    "row-menu-close": rowMenuCloseHandler,
    "row-update-thread": rowUpdateThreadHandler,

    // Inline editing
    "status-menu-toggle": statusMenuToggleHandler,
    "status-menu-close": statusMenuCloseHandler,
    "set-status": setStatusHandler,
    "edit-note": editNoteHandler,
    "note-input": noteInputHandler,
    "note-done": noteDoneHandler,
    "copy-developer": copyDeveloperHandler,

    // Selection
    "clear-selection": clearSelectionHandler,
    "toggle-select": toggleSelectHandler,
    "toggle-all": toggleAllHandler,

    // Bulk operations
    "bulk-set-status": bulkSetStatusHandler,
    "bulk-set-pin": bulkSetPinHandler,
    "bulk-remove": bulkRemoveHandler,

    // Export/Import
    export: exportHandler,
    "export-selected": exportSelectedHandler,
    import: importHandler,

    // Dialog
    close: closeHandler,
  };
}
