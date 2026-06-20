const NOTE_SAVE_DEBOUNCE_MS = 650;

export function createNoteHandlers(context) {
  const { findEntryById, getRoot, notifyMutated, reloadRows, saveNoteNow, state } = context;

  return {
    "edit-note": async (threadId) => {
      const id = String(threadId || "").trim();
      if (!id) return;

      const entry = findEntryById(id);
      if (state.noteDraftById && typeof state.noteDraftById.set === "function") {
        state.noteDraftById.set(id, String(entry?.note ?? ""));
      }

      state.editingNoteId = id;
      await reloadRows();

      window.setTimeout(() => {
        getRoot()
          ?.querySelector(`textarea[data-action="note-input"][data-thread-id="${CSS.escape(id)}"]`)
          ?.focus();
      }, 0);
    },
    "note-input": async (threadId, value) => {
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
        notifyMutated();
      }, NOTE_SAVE_DEBOUNCE_MS);

      state.noteSaveTimers?.set?.(id, timer);
    },
    "note-done": async (threadId) => {
      const id = String(threadId || "").trim();
      if (!id) return;

      const prevTimer = state.noteSaveTimers?.get?.(id);
      if (prevTimer) {
        window.clearTimeout(prevTimer);
        state.noteSaveTimers?.delete?.(id);
        await saveNoteNow(id);
        notifyMutated();
      }

      state.editingNoteId = "";
      await reloadRows();
    },
  };
}
