import { bindRuntimeCommands } from "../api/bridge.js";
import {
  EXAMPLE_BULK_PROGRESS_DIALOG_ID,
  EXAMPLE_DIALOG_ID,
  EXAMPLE_OBSERVER_ID,
  EXAMPLE_PANEL_DIALOG_ID,
} from "../constants.js";

export function createExampleCommandController({
  core,
  state,
  getLifecycle,
  bulkImport,
  onDockAction,
  onDialogClosed,
  onObserverNodes,
  onError,
}) {
  let unbind = () => {};

  function bind() {
    unbind = bindRuntimeCommands(core, (detail) => {
      const command = String(detail.command || "").trim();
      const lifecycle = getLifecycle();
      switch (command) {
        case "enable":
          void lifecycle.enable().catch((error) => onError("enable-command", error, "enable_failed"));
          break;
        case "disable":
          void lifecycle.disable().catch((error) => onError("disable-command", error, "disable_failed"));
          break;
        case "refresh":
          void lifecycle.refresh().catch((error) => onError("refresh-command", error, "refresh_failed"));
          break;
        case "dock-action":
          void onDockAction(String(detail.actionId || "").trim());
          break;
        case "dialog-closed":
          if (String(detail.dialogId || "").trim() === EXAMPLE_PANEL_DIALOG_ID) {
            onDialogClosed("panel", detail);
            return;
          }
          if (String(detail.dialogId || "").trim() === EXAMPLE_BULK_PROGRESS_DIALOG_ID) {
            if (bulkImport.handleDialogClosed() && state.enabled) onDialogClosed("bulk", detail);
            return;
          }
          if (String(detail.dialogId || "").trim() === EXAMPLE_DIALOG_ID) {
            onDialogClosed("dialog", detail);
          }
          break;
        case "observer.nodes":
          if (String(detail.observerId || "").trim() === EXAMPLE_OBSERVER_ID) onObserverNodes(detail);
          break;
        case "teardown":
          void lifecycle.teardown(String(detail.reason || "teardown"));
          break;
        default:
          break;
      }
    });
  }

  return { bind, unbind: () => unbind() };
}
