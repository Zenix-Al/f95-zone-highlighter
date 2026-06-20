import { addListener } from "./listenerRegistry.js";

const ROUTE_EVENT = "f95ue:route-change";
let initialized = false;

export function initRouteObserver(onRouteChange) {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  let queued = false;
  const notify = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      onRouteChange();
    });
  };

  for (const method of ["pushState", "replaceState"]) {
    const original = window.history?.[method];
    if (typeof original !== "function") continue;
    window.history[method] = function patchedRouteState(...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event(ROUTE_EVENT));
      return result;
    };
  }

  addListener("route-observer-history", window, ROUTE_EVENT, notify);
  addListener("route-observer-popstate", window, "popstate", notify);
  addListener("route-observer-hashchange", window, "hashchange", notify);
}
