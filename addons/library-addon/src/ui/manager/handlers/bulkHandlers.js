import { showToast } from "../../utils/showToast.js";
import { createActivityCommandId } from "../../../library/activityCommandId.js";
import { resetPagination } from "../state.js";
import { openOperationProgress, updateOperationProgress, finishOperationProgress, isOperationCancelled } from "../../application/importProgressController.js";

export function createBulkHandlers(context) {
  const { api, deps, getRoot, notifyMutated, reloadRows, state } = context;
  const progressUi = deps.progressController || {
    open: openOperationProgress,
    update: updateOperationProgress,
    finish: finishOperationProgress,
    isCancelled: isOperationCancelled,
  };
  let running = false;

  async function run(label, ids, invoke, { remove = false } = {}) {
    if (running) return showToast("A Library bulk action is still running.", "info");
    if (!ids.length) return showToast("Select at least one row first.", "error");
    running = true;
    const applyButton = getRoot()?.querySelector('[data-action="bulk-apply"]');
    if (applyButton) applyButton.disabled = true;
    let opened = false;
    try {
      opened = await progressUi.open({ label, total: ids.length });
      if (opened) progressUi.update({ total: ids.length, processed: 0 });
      const result = await invoke(
        opened ? progressUi.update : () => {},
        opened ? progressUi.isCancelled : () => false,
      );
      await showToast(`${label}: ${result.updated ?? result.removed ?? 0} changed, ${result.skipped || 0} skipped${result.cancelled ? " (stopped)" : ""}.`, result.ok ? "success" : "error");
      if (remove && result.ok) state.selectedIds = new Set();
      resetPagination(state);
      await reloadRows();
      await notifyMutated();
      return result;
    } catch (error) {
      await showToast(`${label} failed: ${error?.message || error}`, "error");
      throw error;
    } finally {
      if (opened) await progressUi.finish("bulk-finished");
      running = false;
      if (applyButton) applyButton.disabled = false;
    }
  }

  const handlers = {
    "bulk-set-status": () => {
      const ids = [...state.selectedIds];
      const status = String(getRoot()?.querySelector('[data-field="bulkStatus"]')?.value || "saved").trim();
      return run("Bulk status", ids, (onProgress, shouldCancel) => api.bulkUpdateStatus(ids, status, {
        commandId: createActivityCommandId("bulk-status"), onProgress, shouldCancel,
      }));
    },
    "bulk-set-pin": () => {
      const ids = [...state.selectedIds];
      const pinned = getRoot()?.querySelector('[data-field="bulkPin"]')?.value !== "unpin";
      return run("Bulk pin", ids, (onProgress, shouldCancel) => api.bulkSetPinned(ids, pinned, { onProgress, shouldCancel }));
    },
    "bulk-remove": async () => {
      const ids = [...state.selectedIds];
      if (!ids.length) return run("Bulk remove", ids, () => {});
      const confirmed = await deps.askConfirmFn(getRoot(), {
        title: "Remove Selected", message: `Remove ${ids.length} selected entries? This cannot be undone.`,
        confirmText: "Remove", cancelText: "Cancel", danger: true,
      });
      if (!confirmed) return;
      return run("Bulk remove", ids, (onProgress, shouldCancel) => api.bulkRemoveEntries(ids, { onProgress, shouldCancel }), { remove: true });
    },
  };

  handlers["bulk-apply"] = async () => {
    if (running) return;
    const action = String(getRoot()?.querySelector('[data-field="bulkAction"]')?.value || "").trim();
    if (action === "clear") {
      state.selectedIds = new Set();
      await reloadRows();
      return;
    }
    if (action.startsWith("status:")) {
      const ids = [...state.selectedIds];
      return run("Bulk status", ids, (onProgress, shouldCancel) => api.bulkUpdateStatus(ids, action.slice(7), {
        commandId: createActivityCommandId("bulk-status"), onProgress, shouldCancel,
      }));
    }
    if (action === "pin" || action === "unpin") {
      const ids = [...state.selectedIds];
      return run("Bulk pin", ids, (onProgress, shouldCancel) => api.bulkSetPinned(ids, action === "pin", { onProgress, shouldCancel }));
    }
    if (action === "auto-enable" || action === "auto-disable") {
      const ids = [...state.selectedIds];
      return run("Bulk auto update", ids, (onProgress, shouldCancel) => api.setAutoUpdateEnabled(ids, action === "auto-enable", { onProgress, shouldCancel }));
    }
    if (action === "remove") return handlers["bulk-remove"]();
  };
  return handlers;
}
