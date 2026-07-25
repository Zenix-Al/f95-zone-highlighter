import { unwatchObserver } from "../api/observer.js";
import { closeDialog, openDialog, updateDialog } from "../api/ui/dialog.js";
import { removeDockButtons, setDockButtons } from "../api/ui/dock.js";
import { mountUi, unmountUi } from "../api/ui/mount.js";
import { registerStyle, unregisterStyle } from "../api/ui/style.js";
import {
  EXAMPLE_DIALOG_ID,
  EXAMPLE_DOCK_BUTTONS,
  EXAMPLE_DOCK_MOUNT_ID,
  EXAMPLE_EXTRA_MOUNT_ID,
  EXAMPLE_OBSERVER_ID,
  EXAMPLE_PANEL_DIALOG_ID,
  EXAMPLE_STYLE_ID,
} from "../constants.js";
import { debugLog } from "../../../shared/debugLog.js";
import exampleCssText from "../ui/example.css";
import { renderDockMarkup } from "../ui/dockRenderer.js";
import { renderExamplePanel } from "../ui/panel.js";

export function createExampleUiController({
  core,
  runtime,
  state,
  uiBindings,
  isTerminal,
}) {
  let dockButtonsRequested = false;

  function getDialogContentElement(dialogId) {
    return document.getElementById(
      `f95ue-addon-dialog-content-${runtime.addonId}-${String(dialogId || "").trim()}`,
    );
  }

  async function updateOpenDialogContent(dialogId, html) {
    const result = await updateDialog(core, dialogId, html);
    if (result?.ok) return true;
    if (result?.reason !== "unsupported_action") return false;
    const contentEl = getDialogContentElement(dialogId);
    if (!contentEl) return false;
    contentEl.innerHTML = html;
    return true;
  }

  async function syncPanel() {
    if (!state.enabled || isTerminal() || !state.ui.panelOpen) return;
    const html = renderExamplePanel(state);
    if (await updateOpenDialogContent(EXAMPLE_PANEL_DIALOG_ID, html)) return;

    const result = await openDialog(core, {
      dialogId: EXAMPLE_PANEL_DIALOG_ID,
      title: "Example Add-on Playground",
      html,
      size: "lg",
    });
    if (!result?.ok) {
      throw new Error(`Panel sync failed: ${result?.reason || "unknown"}`);
    }
    if (!state.enabled || isTerminal()) {
      await closeDialog(core, EXAMPLE_PANEL_DIALOG_ID, "stale-panel-sync");
      return;
    }
    state.ui.panelOpen = true;
  }

  async function ensureStyleRegistered() {
    const result = await registerStyle(core, EXAMPLE_STYLE_ID, exampleCssText);
    if (!result?.ok) {
      throw new Error(`ui.style.register failed: ${result?.reason || "unknown"}`);
    }
    state.ui.styleRegistered = true;
    return result;
  }

  async function ensureDockButtons() {
    const result = await setDockButtons(core, EXAMPLE_DOCK_BUTTONS);
    if (result?.ok) {
      state.ui.dockButtonsActive = true;
      dockButtonsRequested = true;
    }
    return result;
  }

  async function removeExampleDockButtons() {
    const result = await removeDockButtons(core);
    if (result?.ok) {
      state.ui.dockButtonsActive = false;
      dockButtonsRequested = false;
    }
    return result;
  }

  async function mountDockLauncher() {
    debugLog(runtime.addonId, "Mounting dock launcher.", {
      data: { enabled: state.enabled, mounted: state.ui.dockLauncherMounted },
    });
    const result = await mountUi(core, {
      mountId: EXAMPLE_DOCK_MOUNT_ID,
      slot: "page.dock",
      html: renderDockMarkup(),
    });
    if (!result?.ok) {
      throw new Error(`Dock launcher mount failed: ${result?.reason || "unknown"}`);
    }
    state.ui.dockLauncherMounted = true;
    uiBindings.bindDockMountEvents();
    debugLog(runtime.addonId, "Dock launcher mounted and click listener bound.", {
      data: result,
    });
    return result;
  }

  async function unmountDockLauncher() {
    debugLog(runtime.addonId, "Unbinding and unmounting dock launcher.", {
      data: { enabled: state.enabled, mounted: state.ui.dockLauncherMounted },
    });
    uiBindings.unbindDockMountEvents();
    const result = await unmountUi(core, EXAMPLE_DOCK_MOUNT_ID);
    if (result?.ok) state.ui.dockLauncherMounted = false;
    debugLog(runtime.addonId, "Dock launcher cleanup completed.", {
      data: { result, ui: state.ui },
    });
    return result;
  }

  async function closeExampleDialog(reason = "example-close") {
    const result = await closeDialog(core, EXAMPLE_DIALOG_ID, reason);
    if (result?.ok) state.ui.dialogOpen = false;
    return result;
  }

  async function openExamplePanel() {
    if (state.ui.panelOpen) {
      await syncPanel();
      return {
        ok: true,
        value: { dialogId: EXAMPLE_PANEL_DIALOG_ID, updated: true },
      };
    }
    const result = await openDialog(core, {
      dialogId: EXAMPLE_PANEL_DIALOG_ID,
      title: "Example Add-on Playground",
      html: renderExamplePanel(state),
      size: "lg",
    });
    if (!result?.ok) {
      throw new Error(`Panel open failed: ${result?.reason || "unknown"}`);
    }
    state.ui.panelOpen = true;
    return result;
  }

  async function closeExamplePanel(reason = "example-panel-close") {
    const result = await closeDialog(core, EXAMPLE_PANEL_DIALOG_ID, reason);
    if (result?.ok) state.ui.panelOpen = false;
    return result;
  }

  async function unmountExtra() {
    const result = await unmountUi(core, EXAMPLE_EXTRA_MOUNT_ID);
    if (result?.ok) state.ui.extraMountActive = false;
    return result;
  }

  async function disable(reason = "disable") {
    debugLog(runtime.addonId, `UI cleanup started (reason=${reason}).`, {
      data: { ui: state.ui },
    });
    if (state.observer.isWatching) {
      await unwatchObserver(core, EXAMPLE_OBSERVER_ID);
      state.observer.isWatching = false;
    }
    const dialogCloseResult = await closeExampleDialog(reason);
    const panelCloseResult = await closeExamplePanel(reason);
    await removeDockButtons(core);
    state.ui.dockButtonsActive = false;
    await unmountExtra();
    await unmountDockLauncher();
    if (state.ui.styleRegistered || dialogCloseResult?.ok || panelCloseResult?.ok) {
      const styleResult = await unregisterStyle(core, EXAMPLE_STYLE_ID);
      if (styleResult?.ok) state.ui.styleRegistered = false;
    }
    debugLog(runtime.addonId, `UI cleanup completed (reason=${reason}).`, {
      data: { ui: state.ui },
    });
  }

  async function enable() {
    debugLog(runtime.addonId, "UI enable/remount started.", {
      data: { ui: state.ui, dockButtonsRequested },
    });
    if (!state.ui.styleRegistered) await ensureStyleRegistered();
    if (dockButtonsRequested && !state.ui.dockButtonsActive) await ensureDockButtons();
    if (state.settings.showDockLauncher && !state.ui.dockLauncherMounted) {
      await mountDockLauncher();
    } else if (!state.settings.showDockLauncher && state.ui.dockLauncherMounted) {
      await unmountDockLauncher();
    }
    debugLog(runtime.addonId, "UI enable/remount completed.", {
      data: { ui: state.ui },
    });
  }

  return {
    closeExampleDialog,
    closeExamplePanel,
    disable,
    enable,
    ensureDockButtons,
    getDialogContentElement,
    openExamplePanel,
    removeExampleDockButtons,
    syncPanel,
    unmountExtra,
  };
}
