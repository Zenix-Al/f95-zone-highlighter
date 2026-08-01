import { closeDialog, openDialog } from "../../api/ui/dialog.js";
import { registerStyle, unregisterStyle } from "../../api/ui/style.js";
import { showToast } from "../utils/showToast.js";
import {
  getAutoUpdateStyleText,
  formatAutoUpdateSummary,
  renderAutoUpdateDialog,
} from "./autoUpdateRenderer.js";

export function createAutoUpdateController({ core, addonId, library, scheduler, onSaved }) {
  const dialogId = `${addonId}-auto-update`;
  const styleId = `${addonId}-auto-update-style`;
  let generation = 0;
  let root = null;
  let unbind = () => {};
  let summaryTimer = null;

  function invalidate() {
    generation += 1;
    clearInterval(summaryTimer);
    summaryTimer = null;
    unbind();
    unbind = () => {};
    root = null;
  }

  function values() {
    const number = (name, fallback) =>
      Number(root?.querySelector(`[name="${name}"]`)?.value || fallback);
    return {
      enabled: Boolean(root?.querySelector('[name="enabled"]')?.checked),
      intervalMs: number("intervalHours", 24) * 3_600_000,
      spacingMs: number("spacingMs", 10_000),
      timeoutMs: number("timeoutMs", 30_000),
      retryLimit: number("retryLimit", 2),
      sessionCap: number("sessionCap", 25),
      dailyCap: number("dailyCap", 100),
    };
  }

  async function close(reason = "addon-close") {
    const active = Boolean(root);
    invalidate();
    const result = active
      ? await closeDialog(core, dialogId, reason)
      : { ok: true, value: { alreadyClosed: true } };
    await unregisterStyle(core, styleId);
    return result;
  }

  async function open() {
    const openGeneration = ++generation;
    const [config, summary] = await Promise.all([
      library.autoUpdate.getConfig(),
      library.autoUpdate.getSummary(),
    ]);
    if (openGeneration !== generation) return { ok: false, reason: "cancelled" };
    const styled = await registerStyle(core, styleId, getAutoUpdateStyleText());
    if (!styled?.ok) return styled;
    const result = await openDialog(core, {
      dialogId,
      title: "Library Auto Update",
      html: renderAutoUpdateDialog(config, summary),
      closeOnEsc: true,
      closeOnBackdrop: true,
    });
    if (!result?.ok || openGeneration !== generation) return result;
    root = document.getElementById(String(result.value?.contentId || ""));
    if (!root) return { ok: false, reason: "dialog_content_missing" };

    const controller = new AbortController();
    const refreshSummary = async () => {
      const refreshGeneration = generation;
      const latest = await library.autoUpdate.getSummary();
      if (refreshGeneration !== generation || !root) return;
      const summaryElement = root.querySelector('[data-role="autoUpdateSummary"]');
      if (summaryElement) summaryElement.textContent = formatAutoUpdateSummary(latest);
    };
    summaryTimer = setInterval(() => void refreshSummary(), 500);
    summaryTimer?.unref?.();
    unbind = () => {
      controller.abort();
      clearInterval(summaryTimer);
      summaryTimer = null;
    };
    root.addEventListener("submit", async (event) => {
      event.preventDefault();
      const saved = await library.autoUpdate.putConfig(values());
      if (!saved?.ok) {
        await showToast(`Auto-update settings failed: ${saved?.reason || "unknown"}`, "error");
        return;
      }
      await scheduler.start();
      onSaved?.();
      await close("saved");
    }, { signal: controller.signal });
    root.addEventListener("click", async (event) => {
      const action = event.target?.closest?.("[data-auto-action]")?.dataset.autoAction;
      if (action === "cancel") await close("cancel");
      if (action === "retry") {
        const summaryElement = root?.querySelector('[data-role="autoUpdateSummary"]');
        if (summaryElement) summaryElement.textContent = "Status: retrying failed records";
        const retried = await scheduler.run({ failedOnly: true, force: true });
        if (summaryElement) {
          summaryElement.textContent = formatAutoUpdateSummary(
            retried.status ? retried : await library.autoUpdate.getSummary(),
          );
        }
        onSaved?.();
      }
    }, { signal: controller.signal });
    return result;
  }

  async function handleDialogClosed(detail = {}) {
    if (String(detail.dialogId || "") !== dialogId) return false;
    invalidate();
    await unregisterStyle(core, styleId);
    return true;
  }

  return { open, close, handleDialogClosed };
}
