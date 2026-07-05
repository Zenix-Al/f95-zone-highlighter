import {
  AUTOMATION_MARKER_KEY,
  DIRECT_DOWNLOAD_ROUTE_CONTEXT_KEY,
  DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY,
  DIRECT_DOWNLOAD_ROUTE_TS_KEY,
  DIRECT_DOWNLOAD_ROUTE_TTL_MS,
} from "./constants.js";

export function writeRouteContext(
  {
    ownerTabId = "",
    requestId = "",
    createdAt = Date.now(),
    host = "",
    sourceUrl = "",
  } = {},
  originTabQueryKey = "f95ue_tab",
) {
  try {
    const routeTs = Number(createdAt || Date.now());
    sessionStorage.setItem(
      DIRECT_DOWNLOAD_ROUTE_CONTEXT_KEY,
      JSON.stringify({
        marker: "1",
        originTabQueryKey: String(originTabQueryKey || "f95ue_tab"),
        originTabId: String(ownerTabId || "").trim(),
        requestId: String(requestId || "").trim(),
        routeTs: Number.isFinite(routeTs) && routeTs > 0 ? routeTs : Date.now(),
        host: String(host || "")
          .trim()
          .toLowerCase(),
        sourceUrl: String(sourceUrl || ""),
        writtenAt: Date.now(),
      }),
    );
  } catch {
    // best effort
  }
}

export function readRouteContext(originTabQueryKey = "f95ue_tab") {
  try {
    const raw = sessionStorage.getItem(DIRECT_DOWNLOAD_ROUTE_CONTEXT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      clearRouteContext();
      return null;
    }

    const routeTs = Number(parsed.routeTs || 0);
    const isFresh =
      Number.isFinite(routeTs) &&
      routeTs > 0 &&
      Date.now() - routeTs <= DIRECT_DOWNLOAD_ROUTE_TTL_MS;
    if (!isFresh || String(parsed.marker || "") !== "1") {
      clearRouteContext();
      return null;
    }

    const contextOriginKey = String(
      parsed.originTabQueryKey || "f95ue_tab",
    ).trim();
    if (
      originTabQueryKey &&
      contextOriginKey &&
      contextOriginKey !== originTabQueryKey
    ) {
      return null;
    }

    return {
      marker: "1",
      originTabQueryKey: contextOriginKey,
      originTabId: String(parsed.originTabId || "").trim(),
      requestId: String(parsed.requestId || "").trim(),
      routeTs,
      host: String(parsed.host || "")
        .trim()
        .toLowerCase(),
      sourceUrl: String(parsed.sourceUrl || ""),
    };
  } catch {
    clearRouteContext();
    return null;
  }
}

export function clearRouteContext() {
  try {
    sessionStorage.removeItem(DIRECT_DOWNLOAD_ROUTE_CONTEXT_KEY);
  } catch {
    // best effort
  }
}

export function getRouteRequestId() {
  try {
    const requestId = String(
      new URL(location.href).searchParams.get(
        DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY,
      ) || "",
    ).trim();
    if (requestId) return requestId;
  } catch {
    // fall back to session context
  }

  return readRouteContext()?.requestId || "";
}

export function getRouteOriginTabId(originTabQueryKey = "f95ue_tab") {
  try {
    const originTabId = String(
      new URL(location.href).searchParams.get(originTabQueryKey) || "",
    ).trim();
    if (originTabId) return originTabId;
  } catch {
    // fall back to session context
  }

  return readRouteContext(originTabQueryKey)?.originTabId || "";
}

export function hasFreshRouteContext(originTabQueryKey = "f95ue_tab") {
  try {
    const parsed = new URL(location.href);
    const hasOriginTabId = Boolean(parsed.searchParams.get(originTabQueryKey));
    const hasAutomationMarker =
      String(parsed.searchParams.get(AUTOMATION_MARKER_KEY) || "").trim() ===
      "1";
    const routeTs = Number(
      parsed.searchParams.get(DIRECT_DOWNLOAD_ROUTE_TS_KEY) || 0,
    );
    const hasFreshRouteTs =
      Number.isFinite(routeTs) &&
      routeTs > 0 &&
      Date.now() - routeTs <= DIRECT_DOWNLOAD_ROUTE_TTL_MS;
    if (hasOriginTabId && hasAutomationMarker && hasFreshRouteTs) return true;
  } catch {
    // fall back to session context
  }

  const context = readRouteContext(originTabQueryKey);
  return Boolean(context?.originTabId && context?.requestId);
}
