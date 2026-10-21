import {
  AUTOMATION_MARKER_KEY,
  DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY,
  DIRECT_DOWNLOAD_ROUTE_TS_KEY,
} from "../../constants.js";

const MANAGED_ROUTE_KEYS = [
  AUTOMATION_MARKER_KEY,
  DIRECT_DOWNLOAD_ROUTE_TS_KEY,
  DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY,
  "f95ue_tab",
];

export function preserveManagedRouteMarkers(targetUrl, currentUrl = location.href) {
  try {
    const current = new URL(currentUrl);
    const target = new URL(targetUrl, current);
    for (const key of MANAGED_ROUTE_KEYS) {
      const value = current.searchParams.get(key);
      if (value && !target.searchParams.get(key)) {
        target.searchParams.set(key, value);
      }
    }
    return target.href;
  } catch {
    return String(targetUrl || "");
  }
}
