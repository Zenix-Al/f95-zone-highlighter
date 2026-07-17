import { createCoreBridge } from "./coreBridge.js";

// Transport-facing mechanics only. Domain policy, state transitions, and
// lifecycle ownership remain in each normalized add-on app.
export function createCoreAdaptor(addonId) {
  return createCoreBridge(addonId);
}

export function waitForCorePing(core, timeoutMs) { return core.waitForCorePing(timeoutMs); }
export function registerAddonRuntime(core, addon) { return core.registerAddon(addon); }
export function updateAddonRuntimeStatus(core, status, message = "") { return core.updateStatus(status, message); }
export function bindRuntimeCommands(core, handler) { return core.bindAddonCommands(handler); }
export function notifyTeardownComplete(core, reason = "") { return core.notifyTeardownComplete(reason); }
