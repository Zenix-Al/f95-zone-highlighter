export function createSelectionHandlers(context) {
  const { getPageRows, getRoot, reloadRows, state } = context;

  return {
    "clear-selection": async () => {
      state.selectedIds = new Set();
      await reloadRows();
    },
    "toggle-select": async (threadId) => {
      const id = String(threadId || "").trim();
      if (!id) return;

      const root = getRoot();
      const checkboxes = root?.querySelectorAll(
        `input[data-action="toggle-select"][data-thread-id="${id}"]`,
      );

      if (checkboxes?.length > 0 && checkboxes[0].checked) {
        state.selectedIds.add(id);
      } else {
        state.selectedIds.delete(id);
      }

      await reloadRows();
    },
    "toggle-all": async () => {
      const root = getRoot();
      const pageIds = getPageRows().map((row) => row.threadId);
      const toggleAllCheckbox = root?.querySelector('[data-action="toggle-all"]');

      if (toggleAllCheckbox?.checked) {
        pageIds.forEach((id) => state.selectedIds.add(id));
      } else {
        pageIds.forEach((id) => state.selectedIds.delete(id));
      }

      await reloadRows();
    },
  };
}
