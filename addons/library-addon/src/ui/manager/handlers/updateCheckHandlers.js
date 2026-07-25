import { showToast } from "../../utils/showToast.js";

export function createUpdateCheckHandlers(context) {
  const { api, deps, getRoot, notifyMutated, reloadRows, state } = context;

  async function run(ids) {
    if (!ids.length) {
      await showToast("Select at least one row first.", "error");
      return;
    }
    deps.cancelManualCheckFn("replaced");
    const controller = deps.createManualCheckControllerFn();
    const status = getRoot()?.querySelector("#f95ue-library-rows-status");
    const cancelButton = getRoot()?.querySelector('[data-role="cancelManualCheck"]');
    if (cancelButton) cancelButton.hidden = false;
    await showToast(
      `Checking ${ids.length} Library record${ids.length === 1 ? "" : "s"} in the background.`,
      "success",
    );
    if (status) status.textContent = `Checking 0 / ${ids.length}…`;
    const preview = await api.previewManualUpdateCheck(ids, {
      signal: controller.signal,
      onProgress: ({ completed, total }) => {
        if (status) status.textContent = `Checking ${completed} / ${total}…`;
      },
    });
    if (controller.signal.aborted) {
      if (cancelButton) cancelButton.hidden = true;
      return;
    }
    const result = await api.commitManualUpdateCheck(preview, {
      shouldCancel: () => controller.signal.aborted,
    });
    if (cancelButton) cancelButton.hidden = true;
    if (controller.signal.aborted || result.cancelled) return;
    await showToast(
      `Update check: ${result.changed} changed, ${result.current} current, ${result.failed} failed.`,
      result.failed ? "error" : "success",
    );
    await reloadRows();
    notifyMutated();
  }

  return {
    "check-selected-updates": async () => run([...state.selectedIds]),
    "check-row-update": async (threadId) => run([String(threadId || "").trim()]),
    "cancel-manual-check": async () => {
      deps.cancelManualCheckFn("user-cancelled");
      const button = getRoot()?.querySelector('[data-role="cancelManualCheck"]');
      if (button) button.hidden = true;
      const status = getRoot()?.querySelector("#f95ue-library-rows-status");
      if (status) status.textContent = "Update check cancelled.";
    },
    "open-auto-update": async () => deps.openAutoUpdateFn(),
  };
}
