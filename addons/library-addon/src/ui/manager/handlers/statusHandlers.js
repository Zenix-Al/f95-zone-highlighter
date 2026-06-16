import { showToast } from "../../utils/showToast.js";

const ALLOWED_STATUSES = new Set(["saved", "playing", "completed", "dropped"]);

export function createStatusHandlers(context) {
  const { api, notifyMutated, reloadRows, state } = context;

  return {
    "set-status": async (threadId, nextStatusRaw) => {
      const threadIdClean = String(threadId || "").trim();
      const nextStatus = String(nextStatusRaw || "")
        .trim()
        .toLowerCase();
      if (!threadIdClean || !ALLOWED_STATUSES.has(nextStatus)) return;

      const result = await api.patchEntry(threadIdClean, { userStatus: nextStatus });
      if (!result?.ok) {
        await showToast(`Failed to update status: ${result?.reason || "unknown"}`, "error");
        return;
      }

      state.openStatusMenuId = "";
      await reloadRows();
      notifyMutated();
    },
    "status-menu-toggle": async (threadId) => {
      const id = String(threadId || "").trim();
      state.openStatusMenuId = state.openStatusMenuId === id ? "" : id;
      if (state.openStatusMenuId) state.openRowMenuId = "";
      await reloadRows();
    },
    "status-menu-close": async () => {
      if (!state.openStatusMenuId) return;
      state.openStatusMenuId = "";
      await reloadRows();
    },
  };
}
