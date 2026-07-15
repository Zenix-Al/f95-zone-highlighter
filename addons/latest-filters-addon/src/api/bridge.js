export function waitForCorePing(core, timeoutMs) {
  return core.waitForCorePing(timeoutMs);
}

export function registerAddonRuntime(core, addon) {
  return core.registerAddon(addon);
}

export function updateAddonRuntimeStatus(core, status, statusMessage = "") {
  return core.updateStatus(status, statusMessage);
}

export function bindRuntimeCommands(core, handler) {
  return core.bindAddonCommands(handler);
}

export function notifyTeardownComplete(core, reason = "") {
  return core.notifyTeardownComplete(reason);
}
