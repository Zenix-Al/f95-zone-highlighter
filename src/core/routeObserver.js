import { addListener, removeListener } from "./listenerRegistry.js";
import { beginRoute, isRouteContextCurrent } from "./routeState.js";
import { reportFeatureWarning } from "./featureHealth.js";

const ROUTE_EVENT = "f95ue:route-change";
let cleanupRouteObserver = null;

export function initRouteObserver(onRouteChange) {
  if (cleanupRouteObserver || typeof window === "undefined") return cleanupRouteObserver || (() => {});
  let queued = false;
  let pendingContext = null;
  const originals = new Map();
  const notify = () => {
    const routeContext = beginRoute(window.location);
    if (!routeContext.changed) return;
    pendingContext = routeContext;
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const latestContext = pendingContext;
      pendingContext = null;
      if (!isRouteContextCurrent(latestContext)) return;
      Promise.resolve(onRouteChange?.(latestContext)).catch((error) => {
        reportFeatureWarning("Route", error, "route.reconcile", {
          correlationId: latestContext.correlationId,
          routeGeneration: latestContext.generation,
        });
      });
    });
  };
  for (const method of ["pushState", "replaceState"]) {
    const original = window.history?.[method];
    if (typeof original !== "function") continue;
    const patched = function patchedRouteState(...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event(ROUTE_EVENT));
      return result;
    };
    originals.set(method, { original, patched });
    window.history[method] = patched;
  }
  addListener("route-observer-history", window, ROUTE_EVENT, notify, undefined, "core:route");
  addListener("route-observer-popstate", window, "popstate", notify, undefined, "core:route");
  addListener("route-observer-hashchange", window, "hashchange", notify, undefined, "core:route");
  cleanupRouteObserver = () => {
    for (const [method, entry] of originals) {
      if (window.history[method] === entry.patched) window.history[method] = entry.original;
    }
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
