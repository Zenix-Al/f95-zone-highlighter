import { waitForCoreReady } from "../../../shared/coreReadiness.js";
export async function probeMaskedDirectCore({ bridge, sleep, readinessOptions = {} }) {
  const ping = await waitForCoreReady(bridge, { delay: sleep, ...readinessOptions });
  if (ping.ok) return ping;
  const accessProbe = await bridge.getAddonAccess();
  return accessProbe?.ok ? { ok: true, apiVersion: "probed" } : ping;
}
