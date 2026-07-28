import { bindRuntimeCommands } from "../api/bridge.js";
import {
  THREAD_UTILITY_DIALOG_ID,
  THREAD_UTILITY_SETTINGS_DIALOG_ID,
} from "../constants.js";

export function createThreadUtilityCommandController({
  core,
  getLifecycle,
  onDialogClosed,
  onSettingsDialogClosed = () => {},
  onBeforePageChange,
  onError = () => {},
}) {
  let unbind = () => {};

  function run(command, operation) {
    void operation.catch((error) => onError(command, error));
  }

  function bind() {
    unbind();
    unbind = bindRuntimeCommands(core, (detail = {}) => {
      const lifecycle = getLifecycle();
      const context = {
        commandId: detail.commandId,
        reason: detail.reason,
        routeContext: detail.routeContext,
      };
      switch (String(detail.command || "").trim()) {
        case "enable":
          run("enable", lifecycle.enable(context));
          break;
        case "disable":
          run("disable", lifecycle.disable(context));
          break;
        case "refresh":
          run("refresh", lifecycle.refresh(context));
          break;
        case "before-page-change":
          lifecycle.invalidate(String(detail.reason || "page-change"), detail.routeContext || null);
          onBeforePageChange(detail);
          break;
        case "dialog-closed":
          if (String(detail.dialogId || "").trim() === THREAD_UTILITY_SETTINGS_DIALOG_ID) {
            onSettingsDialogClosed(detail);
          } else if (String(detail.dialogId || "").trim() === THREAD_UTILITY_DIALOG_ID) {
            onDialogClosed(detail);
          }
          break;
        case "teardown":
          run("teardown", lifecycle.teardown(context));
          break;
        default:
          break;
      }
    });
  }

  return {
    bind,
    unbind: () => {
      unbind();
      unbind = () => {};
    },
  };
}
