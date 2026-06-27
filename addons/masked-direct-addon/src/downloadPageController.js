import { AUTOMATION_MARKER_KEY } from "./constants.js";
import { DIRECT_DOWNLOAD_ROUTE_TS_KEY, DIRECT_DOWNLOAD_ROUTE_TTL_MS } from "./constants.js";
import {
  isProcessingDownloadTriggerActive,
  readProcessingDownloadTrigger,
} from "./processingDownloadTrigger.js";
import { normalizeDirectDownloadHost } from "./hosts/metadata.js";

export function createDownloadPageController({
  addonId,
  debugLog,
  GMApi,
  getIsBlockedByCore,
  getIsEnabled,
  handlers,
  originTabQueryKey,
}) {
  function getDownloadHost() {
    return normalizeDirectDownloadHost(location.hostname);
  }

  async function shouldRunHostAutomation(host) {
    if (!host || !getIsEnabled() || getIsBlockedByCore()) return false;
    let marker = "";
    let originTabId = "";
    let routeTs = 0;
    try {
      const parsed = new URL(location.href);
      marker = String(parsed.searchParams.get(AUTOMATION_MARKER_KEY) || "").trim();
      originTabId = String(parsed.searchParams.get(originTabQueryKey) || "").trim();
      routeTs = Number(parsed.searchParams.get(DIRECT_DOWNLOAD_ROUTE_TS_KEY) || 0);
    } catch {
      marker = "";
      originTabId = "";
      routeTs = 0;
    }

    const trigger = await readProcessingDownloadTrigger(GMApi);
    if (isProcessingDownloadTriggerActive(trigger)) {
      const hostMatches = !trigger.host || trigger.host === host;
      const tabMatches = !trigger.ownerTabId || !originTabId || trigger.ownerTabId === originTabId;
      if (hostMatches && tabMatches) return true;
    }

    const hasFreshRouteMarkerFallback =
      marker === "1" &&
      Boolean(originTabId) &&
      Number.isFinite(routeTs) &&
      routeTs > 0 &&
      Date.now() - routeTs <= DIRECT_DOWNLOAD_ROUTE_TTL_MS;
    if (hasFreshRouteMarkerFallback) return true;

    return false;
  }

  async function runDownloadPageHooks() {
    const host = getDownloadHost();
    if (!host) {
      console.info(`[${addonId}] Download hooks skipped: no supported host.`);
      return;
    }

    if (!(await shouldRunHostAutomation(host))) {
      console.info(
        `[${addonId}] Download hooks blocked by automation gate. host=${host} href=${location.href}`,
      );
      debugLog("DownloadHooks", "Automation gate blocked host run.", {
        host,
        href: location.href,
        referrer: document.referrer || "",
      });
      return;
    }

    const handler = handlers[host];
    if (!handler) {
      console.info(`[${addonId}] Download hooks skipped: no handler for host=${host}.`);
      return;
    }

    console.info(`[${addonId}] Download hooks running for host=${host}.`);

    const exec = async () => {
      await handler();
    };

    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          void exec();
        },
        { once: true },
      );
      return;
    }

    await exec();
  }

  return {
    getDownloadHost,
    runDownloadPageHooks,
  };
}
