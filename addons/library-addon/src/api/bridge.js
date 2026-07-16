export const waitForCorePing = (core, timeoutMs) => core.waitForCorePing(timeoutMs);
export const registerAddonRuntime = (core, addon) => core.registerAddon(addon);
export const updateAddonRuntimeStatus = (core, status, message = "") =>
  core.updateStatus(status, message);
export const notifyTeardownComplete = (core, reason = "") =>
  core.notifyTeardownComplete(reason);
export const bindRuntimeCommands = (core, handler) => core.bindAddonCommands(handler);
