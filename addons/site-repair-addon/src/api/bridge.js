export function waitForCorePing(core, timeoutMs) { return core.waitForCorePing(timeoutMs); }
export function registerRuntime(core, addon) { return core.registerAddon(addon); }
export function updateRuntimeStatus(core, status, message) { return core.updateStatus(status, message); }
export function bindRuntimeCommands(core, handler) { return core.bindAddonCommands(handler); }
export function acknowledgeTeardown(core, reason) { return core.notifyTeardownComplete(reason); }
