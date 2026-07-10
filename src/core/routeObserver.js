import { addListener, removeListener } from "./listenerRegistry.js";
import { beginRoute } from "./routeState.js";
import { reportFeatureWarning } from "./featureHealth.js";

const ROUTE_EVENT = "f95ue:route-change";
let cleanupRouteObserver = null;

export function initRouteObserver(onRouteChange) {
  if (cleanupRouteObserver || typeof window === "undefined") return cleanupRouteObserver || (() => {});
  let queued = false;
  const originals = new Map();
  const notify = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const routeContext = beginRoute(window.location);
      if (routeContext.changed) {
        Promise.resolve(onRouteChange?.(routeContext)).catch((error) => {
          reportFeatureWarning("Route", error, "reconcile");
        });
      }
    });
  };
  for (const method of ["pushState", "replaceState"]) {
    const original = window.history?.[method];
    if (typeof original !== "function") continue;
    originals.set(method, original);
    window.history[method] = function patchedRouteState(...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event(ROUTE_EVENT));
      return result;
    };
  }
  addListener("route-observer-history", window, ROUTE_EVENT, notify, undefined, "core:route");
  addListener("route-observer-popstate", window, "popstate", notify, undefined, "core:route");
  addListener("route-observer-hashchange", window, "hashchange", notify, undefined, "core:route");
  cleanupRouteObserver = () => {
    for (const [method, original] of originals) window.history[method] = original;
    removeListener("route-observer-history");
    removeListener("route-observer-popstate");
    removeListener("route-observer-hashchange");
    cleanupRouteObserver = null;
  };
  return cleanupRouteObserver;
}

export function resetRouteObserverForTests() {
  cleanupRouteObserver?.();
}
