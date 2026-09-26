import { config, stateManager } from "../../config.js";
import { resolveAddonAccess } from "./access.js";
import { getTrustedCatalogEntry } from "./catalog.js";
import { emitAddonCommand } from "./lifecycle.js";
import { createLatestMarkerBroker } from "./latestMarkerBroker.js";
import { getRegisteredAddon, subscribeAddonsRegistry } from "./registry.js";
import { getCurrentAddonPageScopes } from "./scope.js";
import { getAddonState } from "./state.js";

const listeners = new Set();
export const latestMarkerBroker = createLatestMarkerBroker({
  authorize(owner) {
    const addon = getRegisteredAddon(owner);
    if (!addon || !addon.capabilities?.includes("latest.markers")) return false;
    const state = getAddonState(owner);
    const access = resolveAddonAccess({
      id: owner, addon, catalogEntry: getTrustedCatalogEntry(owner),
      trustedIds: config.addons?.trustedIds, allowUntrusted: false,
      desiredEnabled: state.enabled,
      currentScopes: getCurrentAddonPageScopes(stateManager),
      currentUrl: typeof window === "undefined" ? "" : window.location.href,
    });
    return access.isTrusted && !access.isBlocked && access.isEnabled && !access.availabilityReason;
  },
  enabled: (id) => config.latestSettings?.latestMarkerProviders?.[id]?.enabled === true,
  dispatch: (owner, detail) => emitAddonCommand(owner, detail.command, detail),
  onChange: (id) => { for (const listener of listeners) listener(id); },
});

subscribeAddonsRegistry(() => latestMarkerBroker.prune());

export function subscribeLatestMarkerProviders(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
