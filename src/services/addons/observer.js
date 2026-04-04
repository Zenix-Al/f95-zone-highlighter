import { addObserverCallback, removeObserverCallback } from "../../core/observer.js";
import {
  ADDON_COMMAND_EVENT,
  MAX_OBSERVER_SUBSCRIPTIONS_PER_ADDON,
  sanitizeAddonId,
  sanitizeObserverSubscriptionId,
} from "./shared.js";

const OBSERVER_SUBSCRIPTIONS = new Map();

function observerSubscriptionKey(addonId, subscriptionId) {
  return `${addonId}:${subscriptionId}`;
}

function getAddonObserverSubscriptionCount(addonId) {
  let count = 0;
  for (const entry of OBSERVER_SUBSCRIPTIONS.values()) {
    if (entry.addonId === addonId) count += 1;
  }
  return count;
}

export function cleanupAddonObserverSubscriptions(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return;

  for (const [key, entry] of OBSERVER_SUBSCRIPTIONS.entries()) {
    if (entry.addonId !== normalizedId) continue;
    removeObserverCallback(entry.callbackId);
    OBSERVER_SUBSCRIPTIONS.delete(key);
  }
}

export function watchAddonObserver(addonId, payload = {}) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return { ok: false, reason: "invalid_addon_id" };

  const observerId = sanitizeObserverSubscriptionId(payload?.observerId);
  if (!observerId) return { ok: false, reason: "observer_id_required" };

  const key = observerSubscriptionKey(normalizedId, observerId);
  const existing = OBSERVER_SUBSCRIPTIONS.get(key);
  if (existing) {
    return { ok: true, observerId };
  }

  if (getAddonObserverSubscriptionCount(normalizedId) >= MAX_OBSERVER_SUBSCRIPTIONS_PER_ADDON) {
    return { ok: false, reason: "observer_subscription_limit" };
  }

  const srcPrefix = String(payload?.srcPrefix || "").trim();
  const callbackId = `addon-observer:direct:${normalizedId}:${observerId}`;

  const filter = (mutationsList) => {
    for (const mutation of mutationsList) {
      for (const node of mutation.addedNodes || []) {
        if (node.nodeType !== 1) continue;

        if (!srcPrefix) return true;

        if (node.tagName === "IMG" && String(node.src || "").startsWith(srcPrefix)) return true;

        const imgs = node.querySelectorAll ? node.querySelectorAll("img") : [];
        for (const img of imgs) {
          if (String(img.src || "").startsWith(srcPrefix)) return true;
        }
      }
    }
    return false;
  };

  const callback = (mutationsList) => {
    const nodes = [];
    const seen = new Set();

    for (const mutation of mutationsList) {
      if (mutation.type !== "childList") continue;
      for (const node of mutation.addedNodes || []) {
        if (node.nodeType !== 1 || seen.has(node)) continue;
        seen.add(node);
        nodes.push(node);
      }
    }

    if (nodes.length === 0) return;

    window.dispatchEvent(
      new CustomEvent(ADDON_COMMAND_EVENT, {
        detail: {
          addonId: normalizedId,
          command: "observer.nodes",
          observerId,
          nodes,
        },
      }),
    );
  };

  addObserverCallback(callbackId, callback, { filter });
  OBSERVER_SUBSCRIPTIONS.set(key, {
    addonId: normalizedId,
    observerId,
    callbackId,
    kind: "direct",
    srcPrefix,
  });

  return { ok: true, observerId };
}

export function unwatchAddonObserver(addonId, payload = {}) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return { ok: false, reason: "invalid_addon_id" };

  const observerId = sanitizeObserverSubscriptionId(payload?.observerId);
  if (!observerId) return { ok: false, reason: "observer_id_required" };

  const key = observerSubscriptionKey(normalizedId, observerId);
  const existing = OBSERVER_SUBSCRIPTIONS.get(key);
  if (!existing) return { ok: true, observerId };

  removeObserverCallback(existing.callbackId);
  OBSERVER_SUBSCRIPTIONS.delete(key);
  return { ok: true, observerId };
}
