import { createCoreBridge } from "../../../shared/coreBridge.js";
import { waitForCoreReady } from "../../../shared/coreReadiness.js";

// F95-only integration. External host and /dl/ automation do not probe core.
export function createMaskedDirectCoreAdaptor(addonId) {
  const bridge = createCoreBridge(addonId);
  return Object.freeze({
    dispatchCoreCommand: bridge.dispatchCoreCommand,
    getAddonAccess: bridge.getAddonAccess,
    invokeCoreAction: bridge.invokeCoreAction,
    waitForCorePing: bridge.waitForCorePing,
  });
}

export async function probeMaskedDirectCore({ bridge, sleep, readinessOptions = {} }) {
  const ping = await waitForCoreReady(bridge, { delay: sleep, ...readinessOptions });
  if (ping.ok) return ping;
  const accessProbe = await bridge.getAddonAccess();
  return accessProbe?.ok ? { ok: true, apiVersion: "probed" } : ping;
}

export function showCoreToast(core, message, type = "info") {
  return core.invokeCoreAction("toast.show", { message: String(message || ""), type });
}
