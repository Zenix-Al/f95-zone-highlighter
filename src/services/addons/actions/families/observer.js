import { normalizeObserverWaitSelector, waitForAddonObserver } from "../../observer.js";
import { defineAction, objectPayload } from "../contract.js";

export function actionObserverWatch(addonId, payload, watchAddonObserver) {
  return watchAddonObserver(addonId, payload);
}

export function actionObserverUnwatch(addonId, payload, unwatchAddonObserver) {
  return unwatchAddonObserver(addonId, payload);
}

function waitPayload(payload) {
  const object = objectPayload(payload);
  if (object !== true || !normalizeObserverWaitSelector(payload?.selector)) {
    return { ok: false, reason: "selector_not_allowed" };
  }
  const timeoutMs = Number(payload?.timeoutMs);
  if (!Number.isFinite(timeoutMs)) return { ok: false, reason: "timeout_required" };
  if (timeoutMs < 100 || timeoutMs > 4000) return { ok: false, reason: "timeout_out_of_range" };
  return true;
}

export const observerActions = Object.freeze([
  defineAction({
    id: "observer.watch", requiredCapabilities: ["observer"],
    execute: ({ addonId, payload, deps }) => actionObserverWatch(addonId, payload, deps.watchAddonObserver),
  }),
  defineAction({
    id: "observer.unwatch", requiredCapabilities: ["observer"],
    execute: ({ addonId, payload, deps }) => actionObserverUnwatch(addonId, payload, deps.unwatchAddonObserver),
  }),
  defineAction({
    id: "observer.waitFor", requiredCapabilities: ["observer"], validatePayload: waitPayload,
    ownership: "addon-scoped one-shot observer subscription",
    cleanup: "remove on match, timeout, unwatch, or addon teardown",
    execute: ({ addonId, payload }) => waitForAddonObserver(addonId, payload),
  }),
]);
