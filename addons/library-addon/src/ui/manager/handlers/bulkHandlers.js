import { showToast } from "../../utils/showToast.js";

export function createBulkHandlers(context) {
  const { api, deps, getRoot, notifyMutated, reloadRows, state } = context;
  const { askConfirmFn } = deps;

  return {
    "bulk-set-status": async () => {
      const ids = [...state.selectedIds];
      if (ids.length === 0) {
        await showToast("Select at least one row first.", "error");
        return;
      }

      const root = getRoot();
      const bulkStatusEl = root?.querySelector('[data-field="bulkStatus"]');
      const nextStatus = String(bulkStatusEl?.value || "saved").trim();
      const result = await api.bulkUpdateStatus(ids, nextStatus);

      await showToast(
        `Bulk status updated: ${result.updated}, skipped: ${result.skipped}.`,
        "success",
      );
      await reloadRows();
      notifyMutated();
    },
    "bulk-set-pin": async () => {
      const ids = [...state.selectedIds];
      if (ids.length === 0) {
        await showToast("Select at least one row first.", "error");
        return;
      }

      const root = getRoot();
      const bulkPinEl = root?.querySelector('[data-field="bulkPin"]');
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
      await reloadRows();
      notifyMutated();
    },
    "bulk-remove": async () => {
      const ids = [...state.selectedIds];
      if (ids.length === 0) {
        await showToast("Select at least one row first.", "error");
        return;
      }

      const confirmed = await askConfirmFn(getRoot(), {
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
      await reloadRows();
      notifyMutated();
    },
  };
}
