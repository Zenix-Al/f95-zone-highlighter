import {
  AUTOMATION_MARKER_KEY,
  DIRECT_DOWNLOAD_ROUTE_TS_KEY,
  DIRECT_DOWNLOAD_ROUTE_TTL_MS,
} from "../../constants.js";
import { hasFreshRouteContext } from "../../ports/routeContextRepository.js";
import { sleep } from "../../shared/utils.js";

export async function closeManagedDownloadTabAfterDelay(
  delayMs,
  originTabQueryKey,
  { managedRequestId = "", requestManagedTabClose = null } = {},
) {
  if (!isManagedDownloadTab(originTabQueryKey, managedRequestId)) {
    console.warn(
      "[DirectDownload] Refusing to close a tab without a fresh managed request.",
    );
    return false;
  }

  console.info(
    `[DirectDownload] Managed-tab close scheduled in ${delayMs}ms after host success.`,
  );
  await sleep(delayMs);

  if (typeof requestManagedTabClose === "function") {
    try {
      await requestManagedTabClose();
      console.info("[DirectDownload] Requested origin-owned managed-tab close.");
    } catch (error) {
      console.warn(
        "[DirectDownload] Origin-owned managed-tab close request failed:",
        error,
      );
    }
  }

  try {
    window.close();
    console.info("[DirectDownload] Executed local window.close() fallback.");
  } catch (error) {
    console.warn("[DirectDownload] Local window.close() failed:", error);
  }

  return true;
}

function isManagedDownloadTab(originTabQueryKey, managedRequestId) {
  if (String(managedRequestId || "").trim()) return true;
  try {
    const url = new URL(location.href);
    const routeTimestamp = Number(
      url.searchParams.get(DIRECT_DOWNLOAD_ROUTE_TS_KEY) || 0,
    );
    const hasFreshMarkers =
      Boolean(url.searchParams.get(originTabQueryKey)) &&
      url.searchParams.get(AUTOMATION_MARKER_KEY) === "1" &&
      Number.isFinite(routeTimestamp) &&
      routeTimestamp > 0 &&
      Date.now() - routeTimestamp <= DIRECT_DOWNLOAD_ROUTE_TTL_MS;
    return hasFreshMarkers || hasFreshRouteContext(originTabQueryKey);
  } catch {
    return false;
  }
}
