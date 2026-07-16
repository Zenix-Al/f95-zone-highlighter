import { createCoreBridge } from "../../../shared/coreBridge.js";

export function createMaskedDirectCoreAdaptor(addonId) {
  const bridge = createCoreBridge(addonId);
  return Object.freeze({
    bindAddonCommands: bridge.bindAddonCommands,
    dispatchCoreCommand: bridge.dispatchCoreCommand,
    getAddonAccess: bridge.getAddonAccess,
    invokeCoreAction: bridge.invokeCoreAction,
    registerAddon: bridge.registerAddon,
    updateStatus: bridge.updateStatus,
    waitForCorePing: bridge.waitForCorePing,
  });
}
