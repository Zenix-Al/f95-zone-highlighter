import { createAddonRuntimeLifecycle } from "../../../shared/runtimeLifecycle.js";

export function createSiteRepairLifecycle(options) {
  return createAddonRuntimeLifecycle({ addonId: "site-repair-addon", ...options });
}
