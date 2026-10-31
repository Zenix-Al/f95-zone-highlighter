import { createAddonRuntimeLifecycle } from "../../../shared/runtimeLifecycle.js";

export function createLibraryLifecycle(options = {}) {
  return createAddonRuntimeLifecycle({ addonId: "library-addon", ...options });
}

export function isLibraryLifecycleCurrent(context) {
  return !context || typeof context.isCurrent !== "function" || context.isCurrent();
}
