import { createAddonRuntimeLifecycle } from "../../../shared/runtimeLifecycle.js";

export function createLibraryLifecycle(options = {}) {
  return createAddonRuntimeLifecycle({ addonId: "library-addon", ...options });
}
