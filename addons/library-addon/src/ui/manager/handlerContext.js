import { LIBRARY_MANAGER_PAGE_SIZE } from "../../constants.js";
import { showToast } from "../utils/showToast.js";

export function createHandlerContext(state, api, deps) {
  const { getRootFn, onMutatedFn, reloadRowsFn } = deps;

  function getRoot() {
    return getRootFn();
  }

  async function reloadRows() {
    const root = getRoot();
    return root ? reloadRowsFn(root) : undefined;
  }

  function notifyMutated() {
    if (typeof onMutatedFn === "function") {
      onMutatedFn();
    }
  }

  function getPageSize() {
    return Math.max(1, Number(state.pageSize || LIBRARY_MANAGER_PAGE_SIZE));
  }

  function getMaxPage() {
    return state.hasNextPage ? state.page + 1 : state.page;
  }

  function getPageRows() {
    return state.rows;
  }

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

  return {
    state,
    api,
    deps,
    getRoot,
    reloadRows,
    notifyMutated,
    getPageSize,
    getMaxPage,
    getPageRows,
    findEntryById,
    saveNoteNow,
  };
}
