import { debugLog } from "../../../shared/debugLog.js";

export function waitForCorePing(core, timeoutMs) {
  debugLog("example-addon", `Handshake ping dispatched (timeoutMs=${timeoutMs ?? "default"}).`, {
    data: { timeoutMs },
  });
  return core.waitForCorePing(timeoutMs).then((result) => {
    debugLog(
      "example-addon",
      `Handshake ping settled (ok=${Boolean(result?.ok)}, apiVersion=${String(result?.apiVersion || "")}).`,
      { data: result },
    );
    return result;
  });
}

export function registerAddonRuntime(core, addon) {
  debugLog("example-addon", `Registration command dispatched (id=${String(addon?.id || "")}, version=${String(addon?.version || "")}, status=${String(addon?.status || "")}, scopes=${Array.isArray(addon?.pageScopes) ? addon.pageScopes.join(",") : ""}, runtimeMode=${String(addon?.runtimeMode || "")}).`, {
    data: {
      id: addon?.id,
      version: addon?.version,
      status: addon?.status,
      pageScopes: addon?.pageScopes,
      runtimeMode: addon?.runtimeMode,
      matches: addon?.matches,
    },
  });
  return core.registerAddon(addon);
}

export function updateAddonRuntimeStatus(core, status, statusMessage = "") {
  debugLog("example-addon", `Status command dispatched (status=${String(status || "")}).`, {
    data: { status, statusMessage },
  });
  return core.updateStatus(status, statusMessage);
}

export function notifyTeardownComplete(core, reason = "") {
  debugLog("example-addon", "Teardown acknowledgment dispatched.", { data: { reason } });
  return core.notifyTeardownComplete(reason);
}

export function bindRuntimeCommands(core, handler) {
  debugLog("example-addon", "Command listener binding requested.");
  return core.bindAddonCommands((detail) => {
    debugLog(
      "example-addon",
      `Core command received (command=${String(detail?.command || "")}, reason=${String(detail?.reason || "")}).`,
      { data: detail },
    );
    return handler(detail);
  });
}
