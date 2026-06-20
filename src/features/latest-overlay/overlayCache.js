import { config } from "../../config.js";
import { OVERLAY_COLOR_ORDER_KEYS, normalizeOverlayColorOrder } from "./overlayOrder.js";

// Shared read-only processing caches refreshed before overlay passes.
// Call refreshCaches() before any processing pass so all consumers read
// a consistent snapshot of config for that pass.
// @type {Map<number, string>|null}
// @type {Map<string, number>|null}
// @type {object|null}

export const cache = {
  tagIdToName: null,
  tagNameToId: null,
  prefixStatusById: null,
  overlayFlags: null,
  overlayColorOrder: OVERLAY_COLOR_ORDER_KEYS,
};

function normalizeStatusName(value) {
  const name = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  return ["completed", "onhold", "abandoned"].includes(name) ? name : null;
}

export function buildPrefixStatusMap(prefixCatalog) {
  const result = new Map();
  const itemsById = new Map(
    (Array.isArray(prefixCatalog?.items) ? prefixCatalog.items : []).map((item) => [
      Number(item?.id),
      item,
    ]),
  );
  const groups = Array.isArray(prefixCatalog?.categories?.games)
    ? prefixCatalog.categories.games
    : [];

  for (const group of groups) {
    if (String(group?.name || "").trim().toLowerCase() !== "status") continue;
    const prefixes = Array.isArray(group.prefixes)
      ? group.prefixes
      : (Array.isArray(group.prefixIds) ? group.prefixIds : []).map((id) => itemsById.get(Number(id)));
    for (const prefix of prefixes) {
      const id = Number(prefix?.id);
      const status = normalizeStatusName(prefix?.name);
      if (Number.isFinite(id) && status) result.set(id, status);
    }
  }
  return result;
}

export function resolvePrefixStatuses(prefixIds) {
  const statuses = new Set();
  for (const rawId of Array.isArray(prefixIds) ? prefixIds : []) {
    const status = cache.prefixStatusById?.get(Number(rawId));
    if (status) statuses.add(status);
  }
  return statuses;
}

function getOverlayColorOrder() {
  return normalizeOverlayColorOrder(config.latestSettings?.latestOverlayColorOrder);
}

export function refreshCaches() {
  cache.tagIdToName = new Map();
  cache.tagNameToId = new Map();
  cache.prefixStatusById = buildPrefixStatusMap(config.prefixes);

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
