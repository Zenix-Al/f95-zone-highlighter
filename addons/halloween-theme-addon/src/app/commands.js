import { bindRuntimeCommands } from "../api/bridge.js";

export function createHalloweenCommandController({ core, getLifecycle, onError }) {
  let unbind = () => {};

  function bind() {
    unbind = bindRuntimeCommands(core, (detail) => {
      const lifecycle = getLifecycle();
      const context = {
        commandId: detail.commandId,
        reason: detail.reason,
        routeContext: detail.routeContext,
      };
      try {
        switch (String(detail.command || "").trim()) {
          case "enable": void lifecycle.enable(context).catch((error) => onError("enable", error)); break;
          case "disable": void lifecycle.disable(context).catch((error) => onError("disable", error)); break;
          case "refresh": void lifecycle.refresh(context).catch((error) => onError("refresh", error)); break;
          case "before-page-change":
            lifecycle.invalidate(context.reason || "page-change", context.routeContext);
            void lifecycle.refresh(context).catch((error) => onError("route-refresh", error));
            break;
          case "teardown": void lifecycle.teardown(context).catch((error) => onError("teardown", error)); break;
          default: break;
        }
      } catch (error) {
        onError("command", error);
      }
    });
  }

  return { bind, unbind: () => unbind() };
}
