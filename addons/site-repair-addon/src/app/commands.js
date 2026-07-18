import { bindRuntimeCommands } from "../api/bridge.js";
import { IMAGE_OBSERVER_ID } from "../constants.js";
import { debugLog } from "../../../shared/debugLog.js";

export function createCommandController({ core, getLifecycle, onNodes, onInvalidate }) {
  let unbind = () => {};
  return {
    bind() {
      unbind = bindRuntimeCommands(core, (detail) => {
        debugLog("site-repair-addon", `Core lifecycle command received: ${String(detail.command || "unknown")}.`, {
          data: {
            commandId: detail.commandId,
            reason: detail.reason,
            generation: detail.generation,
            terminal: detail.terminal,
          },
        });
        const lifecycle = getLifecycle();
        const context = { commandId: detail.commandId, reason: detail.reason, routeContext: detail.routeContext };
        if (detail.command === "enable") void lifecycle.enable(context);
        else if (detail.command === "disable") void lifecycle.disable(context);
        else if (detail.command === "refresh") void lifecycle.refresh(context);
        else if (detail.command === "before-page-change") {
          lifecycle.invalidate(detail.reason, detail.routeContext);
          void onInvalidate?.(detail);
        }
        else if (detail.command === "observer.nodes" && detail.observerId === IMAGE_OBSERVER_ID) onNodes(detail.nodes || []);
        else if (detail.command === "teardown") void lifecycle.teardown(context);
      });
    },
    unbind() { unbind(); unbind = () => {}; },
  };
}
