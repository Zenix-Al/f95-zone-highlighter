import { closeDialog, confirmDialog, openDialog } from "../../api/ui/dialog.js";
import { registerStyle, unregisterStyle } from "../../api/ui/style.js";
import { showToast } from "../utils/showToast.js";
import {
  createAutoUpdateDiagnostics,
  getAutoUpdateStyleText,
  patchAutoUpdateView,
  renderAutoUpdateDialog,
} from "./autoUpdateRenderer.js";

export function createAutoUpdateController({ core, addonId, library, scheduler, onSaved }) {
  const dialogId = `${addonId}-auto-update`;
  const styleId = `${addonId}-auto-update-style`;
  let generation = 0;
  let root = null;
  let cycle = null;
  let config = null;
  let unbind = () => {};

  function invalidate() {
    generation += 1;
    unbind();
    unbind = () => {};
    root = null;
  }

  function values() {
    const numeric = (name, fallback) => Number(root?.querySelector(`[name="${name}"]`)?.value || fallback);
    return {
      ...config,
      enabled: Boolean(root?.querySelector('[name="enabled"]')?.checked),
      checksPerDay: numeric("checksPerDay", 100),
      runHour: numeric("runHour", 0),
      spacingMs: numeric("spacingMs", 10_000),
      timeoutMs: numeric("timeoutMs", 30_000),
      retryLimit: numeric("retryLimit", 2),
    };
  }

  function refresh(nextCycle = cycle, runtime = {}) {
    cycle = nextCycle;
    patchAutoUpdateView(root, cycle, {
      checksPerDay: config?.checksPerDay,
      ...scheduler.snapshot(),
      ...runtime,
    });
  }

  async function confirm(title, description, confirmLabel, danger = false) {
    const result = await confirmDialog(core, {
      title,
      description,
      confirmLabel,
      cancelLabel: "Cancel",
      danger,
    });
    return Boolean(result?.ok && result.value?.confirmed);
  }

  async function close(reason = "addon-close") {
    const active = Boolean(root);
    invalidate();
    const result = active ? await closeDialog(core, dialogId, reason) : { ok: true };
    await unregisterStyle(core, styleId);
    return result;
  }

  async function runAction(action) {
    refresh(cycle, { running: true });
    let result;
    if (["run-now", "resume"].includes(action)) result = await scheduler.run({ runNow: true });
    if (action === "pause") result = await scheduler.pause();
    if (action === "continue-batch") {
      const accepted = await confirm(
        "Continue another batch?",
        `Allow up to ${cycle?.checksPerDay || config.checksPerDay} additional Library checks today. Spacing and retry limits still apply.`,
        "Continue batch",
      );
      if (!accepted) { refresh(); return; }
      result = await scheduler.grantNextBatch();
    }
    if (action === "check-again") {
      const accepted = await confirm(
        "Check the Library again?",
        "The current cycle is complete. This creates a fresh snapshot before its scheduled time.",
        "Check again",
      );
      if (!accepted) { refresh(); return; }
      result = await scheduler.run({ runNow: true, force: true });
    }
    if (action === "restart") {
      const accepted = await confirm(
        "Restart update cycle?",
        "Unfinished queue progress will be discarded and rebuilt from the current Library.",
        "Restart cycle",
        true,
      );
      if (!accepted) { refresh(); return; }
      result = await scheduler.restartCycle();
    }
    const latest = result?.cycle || await scheduler.getDurableState();
    refresh(latest);
    if (result?.reason === "lease_owned") {
      await showToast("Update recovery is waiting for the previous tab lease. It will resume automatically.", "info");
    } else if (result && !result.ok && !["not_due", "daily_allowance_exhausted"].includes(result.reason)) {
      await showToast(`Auto update failed: ${result.reason || "unknown"}`, "error");
    }
    onSaved?.();
  }

  async function open() {
    const openGeneration = ++generation;
    [config, cycle] = await Promise.all([
      library.autoUpdate.getConfig(),
      scheduler.getDurableState(),
    ]);
    if (openGeneration !== generation) return { ok: false, reason: "cancelled" };
    const styled = await registerStyle(core, styleId, getAutoUpdateStyleText());
    if (!styled?.ok) return styled;
    const result = await openDialog(core, {
      dialogId,
      title: "Library Auto Update",
      html: renderAutoUpdateDialog(config, cycle),
      scrollMode: "addon",
      closeOnEsc: true,
      closeOnBackdrop: true,
    });
    if (!result?.ok || openGeneration !== generation) return result;
    root = document.getElementById(String(result.value?.contentId || ""));
    if (!root) return { ok: false, reason: "dialog_content_missing" };
    refresh(cycle);
    const controller = new AbortController();
    const unsubscribe = scheduler.subscribe((nextCycle) => refresh(nextCycle));
    unbind = () => { controller.abort(); unsubscribe(); };
    root.addEventListener("submit", async (event) => {
      event.preventDefault();
      const saved = await library.autoUpdate.putConfig(values());
      if (!saved?.ok) return showToast(`Auto-update settings failed: ${saved?.reason || "unknown"}`, "error");
      config = await library.autoUpdate.getConfig();
      await scheduler.start({ reschedule: true });
      refresh(cycle);
      onSaved?.();
      await showToast("Auto-update settings saved.", "success");
    }, { signal: controller.signal });
    root.addEventListener("click", async (event) => {
      const button = event.target?.closest?.("[data-auto-action]");
      const action = button?.dataset.autoAction;
      if (!action || button.disabled) return;
      if (action === "cancel") return close("cancel");
      if (action === "copy-diagnostics") {
        await navigator.clipboard.writeText(createAutoUpdateDiagnostics(cycle));
        return showToast("Auto-update diagnostics copied.", "success");
      }
      await runAction(action);
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
