import { registerDiagnosticsProvider, recordHealthEvent } from "./featureHealth.js";

let routeGeneration = 0;
let currentUrl = "";
let currentPageFlags = {};
let controller = new AbortController();
let correlationId = "route:0";

export function normalizeRouteUrl(locationLike = globalThis.location) {
  const href = String(locationLike?.href || "");
  try {
    const url = new URL(href, globalThis.location?.href || undefined);
    // Hash-only changes are meaningful on XenForo pages and must invalidate DOM work.
    return `${url.origin}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

function createCorrelationId() {
  return `route:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export function getRouteContext() {
  return {
    url: currentUrl,
    generation: routeGeneration,
    correlationId,
    signal: controller.signal,
    pageFlags: { ...currentPageFlags },
  };
}

export function beginRoute(locationLike = globalThis.location, { force = false } = {}) {
  const url = normalizeRouteUrl(locationLike);
  if (!force && url === currentUrl) return { ...getRouteContext(), changed: false };
  controller.abort(new DOMException("route changed", "AbortError"));
  controller = new AbortController();
  currentUrl = url;
  routeGeneration += 1;
  correlationId = createCorrelationId();
  recordHealthEvent({ code: "ROUTE_TRANSITION", severity: "info", ownerId: `route:${routeGeneration}`, subsystem: "route", message: "Route changed", correlationId, routeGeneration, details: { changed: true } });
  return { ...getRouteContext(), changed: true };
}

export function isRouteContextCurrent(routeContext) {
  return Boolean(routeContext)
    && Number(routeContext.generation) === routeGeneration
    && String(routeContext.url || "") === currentUrl
    && !routeContext.signal?.aborted;
}

export function setRoutePageFlags(pageFlags) {
  currentPageFlags = pageFlags && typeof pageFlags === "object" ? { ...pageFlags } : {};
  return getRouteContext();
}

export function abortCurrentRoute(reason = "route cancelled") {
  controller.abort(new DOMException(reason, "AbortError"));
}

export function resetRouteStateForTests() {
  controller.abort(new DOMException("route state reset", "AbortError"));
  routeGeneration = 0;
  currentUrl = "";
  currentPageFlags = {};
  correlationId = "route:0";
  controller = new AbortController();
}

registerDiagnosticsProvider("route", () => ({ generation: routeGeneration, correlationId, pageFlags: { ...currentPageFlags } }));
