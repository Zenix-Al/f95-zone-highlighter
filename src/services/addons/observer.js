import { addObserverCallback, removeObserverCallback } from "../../core/observer.js";
import {
  ADDON_COMMAND_EVENT,
  MAX_OBSERVER_SUBSCRIPTIONS_PER_ADDON,
  sanitizeAddonId,
  sanitizeObserverSubscriptionId,
} from "./shared.js";

const OBSERVER_SUBSCRIPTIONS = new Map();
const WAIT_SUBSCRIPTIONS = new Map();

const MAX_WAIT_SELECTOR_LENGTH = 200;
const MIN_WAIT_TIMEOUT_MS = 100;
const MAX_WAIT_TIMEOUT_MS = 4000;

export function normalizeObserverWaitSelector(value) {
  const selector = String(value || "").trim();
  if (!selector || selector.length > MAX_WAIT_SELECTOR_LENGTH) return "";
  // Keep the public wait API bounded to simple element/class/id/data selectors.
  // Pseudo selectors, commas, universal selectors, and traversal expressions
  // would make ownership and cost difficult to reason about.
  if (/[,*:[\]]/.test(selector) || /[+~]/.test(selector)) return "";
  if (!/^(?:[a-z][a-z0-9-]*)?(?:[#.][a-z0-9_-]+)*$/i.test(selector)) return "";
  return selector;
}

function waitSubscriptionKey(addonId, observerId) {
  return `${addonId}:${observerId}`;
}

function finishWait(key, result) {
  const entry = WAIT_SUBSCRIPTIONS.get(key);
  if (!entry) return false;
  WAIT_SUBSCRIPTIONS.delete(key);
  clearTimeout(entry.timer);
  removeObserverCallback(entry.callbackId);
  entry.resolve(result);
  return true;
}

function removeWaitSubscription(addonId, observerId, result = { ok: false, reason: "cancelled" }) {
  return finishWait(waitSubscriptionKey(addonId, observerId), {
    ...result,
    value: { observerId },
  });
}

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

export function isAddonOwnedObserverNode(node, addonId) {
  let current = node?.nodeType === 1 ? node : null;
  while (current) {
    if (String(current.getAttribute?.("data-addon-id") || "") === addonId) return true;
    current = current.parentElement || current.getRootNode?.()?.host || null;
  }
  return false;
}

function matchesObserverNode(node, addonId, srcPrefix) {
  if (node?.nodeType !== 1 || isAddonOwnedObserverNode(node, addonId)) return false;
  if (!srcPrefix) return true;
  if (node.tagName === "IMG" && String(node.src || "").startsWith(srcPrefix)) return true;
  const imgs = node.querySelectorAll ? node.querySelectorAll("img") : [];
  return [...imgs].some((img) => String(img.src || "").startsWith(srcPrefix));
}

export function cleanupAddonObserverSubscriptions(addonId) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return;

  for (const [key, entry] of OBSERVER_SUBSCRIPTIONS.entries()) {
    if (entry.addonId !== normalizedId) continue;
    removeObserverCallback(entry.callbackId);
    OBSERVER_SUBSCRIPTIONS.delete(key);
  }

  for (const entry of [...WAIT_SUBSCRIPTIONS.values()]) {
    if (entry.addonId === normalizedId) {
      removeWaitSubscription(normalizedId, entry.observerId);
    }
  }
}

export function waitForAddonObserver(addonId, payload = {}) {
  const normalizedId = sanitizeAddonId(addonId);
  if (!normalizedId) return Promise.resolve({ ok: false, reason: "invalid_addon_id" });

  const observerId = sanitizeObserverSubscriptionId(payload?.observerId);
  if (!observerId) return Promise.resolve({ ok: false, reason: "observer_id_required" });

  const selector = normalizeObserverWaitSelector(payload?.selector);
  if (!selector) return Promise.resolve({ ok: false, reason: "selector_not_allowed" });

  const timeoutMs = Number(payload?.timeoutMs);
  if (!Number.isFinite(timeoutMs)) return Promise.resolve({ ok: false, reason: "timeout_required" });
  const boundedTimeout = Math.max(MIN_WAIT_TIMEOUT_MS, Math.min(MAX_WAIT_TIMEOUT_MS, timeoutMs));
  const key = waitSubscriptionKey(normalizedId, observerId);
  if (WAIT_SUBSCRIPTIONS.has(key)) {
    return Promise.resolve({ ok: false, reason: "observer_wait_exists" });
  }
  if (typeof document === "undefined" || !document.body) {
    return Promise.resolve({ ok: false, reason: "document_not_ready" });
  }

  const findMatch = () => {
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  };
  if (findMatch()) {
    return Promise.resolve({ ok: true, value: { observerId, matched: true } });
  }

  return new Promise((resolve) => {
    const callbackId = `addon-observer:wait:${normalizedId}:${observerId}`;
    const finishMatched = () => {
      if (findMatch()) finishWait(key, { ok: true, value: { observerId, matched: true } });
    };
    const filter = (mutationsList) => mutationsList.some((mutation) => mutation.type === "childList");
    const timer = setTimeout(
      () => finishWait(key, { ok: false, reason: "observer_timeout", value: { observerId, matched: false } }),
      boundedTimeout,
    );

    WAIT_SUBSCRIPTIONS.set(key, { addonId: normalizedId, observerId, callbackId, timer, resolve });
    addObserverCallback(callbackId, finishMatched, { filter, healthId: "Add-ons Service" });
  });
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
        if (matchesObserverNode(node, normalizedId, srcPrefix)) return true;
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
        if (!matchesObserverNode(node, normalizedId, srcPrefix) || seen.has(node)) continue;
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

  addObserverCallback(callbackId, callback, { filter, healthId: "Add-ons Service" });
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
  removeWaitSubscription(normalizedId, observerId);
  const existing = OBSERVER_SUBSCRIPTIONS.get(key);
  if (!existing) return { ok: true, observerId };

  removeObserverCallback(existing.callbackId);
  OBSERVER_SUBSCRIPTIONS.delete(key);
  return { ok: true, observerId };
}
