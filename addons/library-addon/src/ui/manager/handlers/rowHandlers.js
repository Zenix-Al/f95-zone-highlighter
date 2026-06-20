import { showToast } from "../../utils/showToast.js";

function buildThreadPatch(snapshot) {
  return {
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
  };
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.top = "-1000px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      return true;
    } catch {
      return false;
    }
  }
}

export function createRowHandlers(context) {
  const { api, deps, getRoot, notifyMutated, reloadRows, state } = context;
  const { askConfirmFn, getLiveThreadSnapshotFn } = deps;

  return {
    remove: async (threadId) => {
      const id = String(threadId || "").trim();
      if (!id) return;

      const confirmed = await askConfirmFn(getRoot(), {
        title: "Remove Entry",
        message: "Remove this entry from library?",
        confirmText: "Remove",
        cancelText: "Cancel",
        danger: true,
      });

      if (!confirmed) return;

      const result = await api.removeEntry(id);
      if (!result?.ok) {
        await showToast("Failed to Remove entry.", "error");
        return;
      }

      await showToast("Entry Removed from library.", "success");
      await reloadRows();
      notifyMutated();
    },
    "row-menu-toggle": async (threadId) => {
      const id = String(threadId || "").trim();
      state.openRowMenuId = state.openRowMenuId === id ? "" : id;
      if (state.openRowMenuId) state.openStatusMenuId = "";
      await reloadRows();
    },
    "row-menu-close": async () => {
      if (!state.openRowMenuId) return;
      state.openRowMenuId = "";
      await reloadRows();
    },
    "row-update-thread": async (threadId) => {
      const entryId = String(threadId || "").trim();
      if (!entryId) return;

      const snapshot =
        typeof getLiveThreadSnapshotFn === "function" ? getLiveThreadSnapshotFn() : null;

      if (!snapshot?.threadId || snapshot.threadId !== entryId) {
        await showToast("Open this entry's thread page to enable update.", "error");
        return;
      }

      const result = await api.patchEntry(entryId, buildThreadPatch(snapshot));
      if (!result?.ok) {
        await showToast(`Failed to update entry: ${result?.reason || "unknown"}`, "error");
        return;
      }

      state.openRowMenuId = "";
      await showToast("Entry updated from this thread.", "success");
      await reloadRows();
      notifyMutated();
    },
    "copy-developer": async (_threadId, _value, buttonEl) => {
      const text = String(buttonEl?.dataset?.copyText || "").trim();
      if (!text) return;

      const copied = await copyTextToClipboard(text);
      await showToast(copied ? "Copied developer." : "Failed to copy.", copied ? "success" : "error");
    },
  };
}
