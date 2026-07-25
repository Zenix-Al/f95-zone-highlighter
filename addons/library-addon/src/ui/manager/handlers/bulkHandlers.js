import { showToast } from "../../utils/showToast.js";
import { createActivityCommandId } from "../../../library/activityCommandId.js";

export function createBulkHandlers(context) {
  const { api, deps, getRoot, notifyMutated, reloadRows, state } = context;
  const { askConfirmFn } = deps;

  const handlers = {
    "bulk-set-status": async () => {
      const ids = [...state.selectedIds];
      if (ids.length === 0) {
        await showToast("Select at least one row first.", "error");
        return;
      }

      const root = getRoot();
      const bulkStatusEl = root?.querySelector('[data-field="bulkStatus"]');
      const nextStatus = String(bulkStatusEl?.value || "saved").trim();
      const result = await api.bulkUpdateStatus(ids, nextStatus, {
        commandId: createActivityCommandId("bulk-status"),
      });

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

  handlers["bulk-apply"] = async () => {
    const root = getRoot();
    const action = String(
      root?.querySelector('[data-field="bulkAction"]')?.value || "",
    ).trim();
    if (action === "clear") {
      state.selectedIds = new Set();
      await reloadRows();
      return;
    }
    if (action.startsWith("status:")) {
      if (state.selectedIds.size === 0) {
        await showToast("Select at least one row first.", "error");
        return;
      }
      const temporary = root?.querySelector('[data-field="bulkStatus"]');
      if (temporary) temporary.value = action.slice(7);
      else {
        const result = await api.bulkUpdateStatus([...state.selectedIds], action.slice(7), {
          commandId: createActivityCommandId("bulk-status"),
        });
        await showToast(
          `Bulk status updated: ${result.updated}, skipped: ${result.skipped}.`,
          "success",
        );
        await reloadRows();
        notifyMutated();
        return;
      }
      return handlers["bulk-set-status"]();
    }
    if (action === "pin" || action === "unpin") {
      if (state.selectedIds.size === 0) {
        await showToast("Select at least one row first.", "error");
        return;
      }
      let updated = 0;
      let skipped = 0;
      for (const id of state.selectedIds) {
        const result = await api.patchEntry(id, { pinned: action === "pin" });
        if (result?.ok) updated += 1;
        else skipped += 1;
      }
      await showToast(`Bulk pin updated: ${updated}, skipped: ${skipped}.`, "success");
      await reloadRows();
      notifyMutated();
      return;
    }
    if (action === "auto-enable" || action === "auto-disable") {
      if (state.selectedIds.size === 0) {
        await showToast("Select at least one row first.", "error");
        return;
      }
      const result = await api.setAutoUpdateEnabled(
        [...state.selectedIds],
        action === "auto-enable",
      );
      await showToast(`Auto update changed: ${result.updated}, skipped: ${result.skipped}.`, "success");
      await reloadRows();
      notifyMutated();
      return;
    }
    if (action === "remove") await handlers["bulk-remove"]();
  };

  return handlers;
}
