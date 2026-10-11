import { waitForCoreReady } from "../../../shared/coreReadiness.js";
export function waitForCorePing(core, timeoutMs) {
  return waitForCoreReady(core, timeoutMs === undefined ? {} : { timeoutMs });
}

export function registerAddonRuntime(core, descriptor) {
  return core.registerAddon(descriptor);
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
