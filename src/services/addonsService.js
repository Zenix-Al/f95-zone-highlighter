/** Stable public facade for the core add-on service. */
import { reloadTrustedAddonCatalog } from "./addons/catalog.js";
import { reapplyAddonSecurityPolicies } from "./addons/registry.js";

export { isAddonsServiceDisabled } from "./addons/apiPolicy.js";
export { initAddonsConsoleBridge } from "./addons/bootstrap.js";
export {
  getAddonActionBlockReason,
  getAddonExecutionBlockReason,
  invokeAddonCoreAction,
} from "./addons/invocation.js";
export { isCatalogFresh } from "./addons/catalog.js";
export { listKnownAddons } from "./addons/knownAddons.js";
export {
  listRegisteredAddons,
  registerAddon,
  replaceRegisteredAddons,
  subscribeAddonsRegistry,
  validateAddonRegistration,
} from "./addons/registry.js";
export {
  disableAddonsService,
  getAddonLifecycleSnapshot,
  notifyAllAddonsBeforePageChange,
  shutdownAddonsService,
  unregisterAddon,
} from "./addons/runtimeLifecycle.js";
export {
  clearAddonState,
  getAddonState,
  removeAddonInstallationTrace,
  setAddonStateValue,
} from "./addons/state.js";

export async function refreshAddonSecurityPolicies({ reloadCatalog = false } = {}) {
  if (reloadCatalog) await reloadTrustedAddonCatalog();
  return reapplyAddonSecurityPolicies();
}
