import { createAddonRuntimeLifecycle } from "../../../shared/runtimeLifecycle.js";

export function createExampleLifecycle(options = {}) {
  return createAddonRuntimeLifecycle({
    addonId: "example-addon",
    ...options,
  });
}
