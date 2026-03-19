import { config } from "../../config.js";
import { OVERLAY_COLOR_ORDER_KEYS, normalizeOverlayColorOrder } from "./overlayOrder.js";

// Shared mutable caches consumed by tilePatcher and hoverTagHandler.
// Call refreshCaches() before any processing pass so all consumers read
// a consistent snapshot of config for that pass.
export const cache = {
  /** @type {Map<number, string>|null} */
  tagIdToName: null,
  /** @type {Map<string, number>|null} */
  tagNameToId: null,
  /** @type {object|null} */
  overlayFlags: null,
  overlayColorOrder: OVERLAY_COLOR_ORDER_KEYS,
};

function getOverlayColorOrder() {
  return normalizeOverlayColorOrder(config.latestSettings?.latestOverlayColorOrder);
}

export function refreshCaches() {
  cache.tagIdToName = new Map();
  cache.tagNameToId = new Map();

  (config.tags || []).forEach((t) => {
    cache.tagIdToName.set(Number(t.id), t.name);
    if (t && typeof t.name !== "undefined") {
      cache.tagNameToId.set(String(t.name).toLowerCase(), Number(t.id));
    }
  });

  cache.overlayFlags = {
    excluded: Boolean(config.overlaySettings?.excluded),
    preferred: Boolean(config.overlaySettings?.preferred),
    completed: Boolean(config.overlaySettings?.completed),
    onhold: Boolean(config.overlaySettings?.onhold),
    abandoned: Boolean(config.overlaySettings?.abandoned),
    highVersion: Boolean(config.overlaySettings?.highVersion),
    invalidVersion: Boolean(config.overlaySettings?.invalidVersion),
    overlayText: Boolean(config.overlaySettings?.overlayText),
  };

  cache.overlayColorOrder = getOverlayColorOrder();
}
