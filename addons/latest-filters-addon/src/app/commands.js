import { bindRuntimeCommands } from "../api/bridge.js";

export function createLatestFiltersCommandController({ core, getLifecycle, onEvent, onBeforePageChange, onCommandError } = {}) {
  let unbind = () => {};

  function bind() {
    unbind = bindRuntimeCommands(core, (detail) => {
      const lifecycle = getLifecycle();
      const context = {
        commandId: detail.commandId,
        reason: detail.reason,
        routeContext: detail.routeContext,
        dialogId: detail.dialogId,
        actionId: detail.actionId,
      };
      try {
        switch (String(detail.command || "").trim()) {
          case "enable": void lifecycle.enable(context).catch((error) => onCommandError?.("enable", error)); break;
          case "disable": void lifecycle.disable(context).catch((error) => onCommandError?.("disable", error)); break;
          case "refresh": void lifecycle.refresh(context).catch((error) => onCommandError?.("refresh", error)); break;
          case "before-page-change":
            onBeforePageChange?.(detail, context);
            lifecycle.invalidate(context.reason || "page-change", context.routeContext);
            void lifecycle.refresh(context).catch((error) => onCommandError?.("route-refresh", error));
            break;
          case "dialog-closed":
          case "toast":
          case "panel-action":
            onEvent?.(detail, context);
            break;
          case "teardown": void lifecycle.teardown(context).catch((error) => onCommandError?.("teardown", error)); break;
          default: break;
        }
      } catch (error) {
        onCommandError?.("command", error);
      }
    });
  }

  return { bind, unbind: () => unbind() };
}
