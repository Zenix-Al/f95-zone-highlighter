import { createAddonRuntimeLifecycle } from "../../../shared/runtimeLifecycle.js";

export function createThreadUtilityLifecycle(options = {}) {
  return createAddonRuntimeLifecycle({
    addonId: "thread-utility-addon",
    ...options,
  });
}
