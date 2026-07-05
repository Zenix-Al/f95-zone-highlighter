import { AUTOMATION_MARKER_KEY } from "./constants.js";
import {
  DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY,
  DIRECT_DOWNLOAD_ROUTE_TS_KEY,
  DIRECT_DOWNLOAD_ROUTE_TTL_MS,
} from "./constants.js";
import {
  isProcessingDownloadTriggerActive,
  readProcessingDownloadTriggers,
} from "./processingDownloadTrigger.js";
import { normalizeDirectDownloadHost } from "./hosts/metadata.js";
import { writeRouteContext } from "./routeContext.js";

const STRIPPED_MARKER_RECOVERY_TTL_MS = 45 * 1000;
const STRIPPED_MARKER_IDENTIFIER_WAIT_TIMEOUT_MS = 15 * 1000;
const STRIPPED_MARKER_IDENTIFIER_POLL_MS = 250;

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
    let requestId = "";
    let routeTs = 0;
    try {
      const parsed = new URL(location.href);
      marker = String(
        parsed.searchParams.get(AUTOMATION_MARKER_KEY) || "",
      ).trim();
      originTabId = String(
        parsed.searchParams.get(originTabQueryKey) || "",
      ).trim();
      requestId = String(
        parsed.searchParams.get(DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY) || "",
      ).trim();
      routeTs = Number(
        parsed.searchParams.get(DIRECT_DOWNLOAD_ROUTE_TS_KEY) || 0,
      );
    } catch {
      marker = "";
      originTabId = "";
      requestId = "";
      routeTs = 0;
    }

    const triggers = await readProcessingDownloadTriggers(GMApi);
    const trigger = requestId
      ? triggers.find((entry) => entry.requestId === requestId)
      : null;
    if (trigger && isProcessingDownloadTriggerActive(trigger)) {
      const hostMatches = !trigger.host || trigger.host === host;
      const tabMatches =
        !trigger.ownerTabId || trigger.ownerTabId === originTabId;
      if (hostMatches && tabMatches) return true;
    }

    const strippedMarkerTrigger = findSingleStrippedMarkerTrigger(
      host,
      triggers,
      {
        pageIdentifier: getCurrentPageFileIdentifier(host),
      },
    );
    if (strippedMarkerTrigger) {
      restoreRouteMarkersFromTrigger(strippedMarkerTrigger, originTabQueryKey);
      debugLog("DownloadHooks", "Recovered marker-stripped host redirect.", {
        host,
        href: location.href,
        sourceUrl: strippedMarkerTrigger.sourceUrl,
        requestId: strippedMarkerTrigger.requestId,
      });
      return true;
    }

    const delayedStrippedMarkerTrigger =
      await waitForStrippedMarkerIdentifierTrigger(host, triggers);
    if (delayedStrippedMarkerTrigger) {
      restoreRouteMarkersFromTrigger(
        delayedStrippedMarkerTrigger,
        originTabQueryKey,
      );
      debugLog(
        "DownloadHooks",
        "Recovered marker-stripped host redirect after identifier wait.",
        {
          host,
          href: location.href,
          sourceUrl: delayedStrippedMarkerTrigger.sourceUrl,
          requestId: delayedStrippedMarkerTrigger.requestId,
        },
      );
      return true;
    }

    const hasFreshRouteMarkerFallback =
      marker === "1" &&
      Boolean(originTabId) &&
      Boolean(requestId) &&
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
      console.info(
        `[${addonId}] Download hooks skipped: no handler for host=${host}.`,
      );
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

function findSingleStrippedMarkerTrigger(
  host,
  triggers,
  { pageIdentifier = "" } = {},
) {
  const sourceGroups = getRecoverableStrippedMarkerSourceGroups(host, triggers);

  if (sourceGroups.size === 1) return [...sourceGroups.values()][0];

  const normalizedPageIdentifier = normalizeFileIdentifier(pageIdentifier);
  if (!normalizedPageIdentifier) return null;

  const matches = [...sourceGroups.values()].filter((trigger) => {
    const sourceIdentifier = getSourceFileIdentifier(trigger.sourceUrl);
    return (
      sourceIdentifier &&
      normalizeFileIdentifier(sourceIdentifier) === normalizedPageIdentifier
    );
  });

  return matches.length === 1 ? matches[0] : null;
}

async function waitForStrippedMarkerIdentifierTrigger(host, triggers) {
  if (host !== "datanodes.to") return null;
  const sourceGroups = getRecoverableStrippedMarkerSourceGroups(host, triggers);
  if (sourceGroups.size < 2) return null;

  const startedAt = Date.now();
  while (Date.now() - startedAt < STRIPPED_MARKER_IDENTIFIER_WAIT_TIMEOUT_MS) {
    const pageIdentifier = getCurrentPageFileIdentifier(host);
    const trigger = findSingleStrippedMarkerTrigger(host, triggers, {
      pageIdentifier,
    });
    if (trigger) return trigger;
    await delay(STRIPPED_MARKER_IDENTIFIER_POLL_MS);
  }

  return null;
}

function getRecoverableStrippedMarkerSourceGroups(host, triggers) {
  const now = Date.now();
  const sourceGroups = new Map();

  for (const trigger of triggers) {
    if (!isProcessingDownloadTriggerActive(trigger)) continue;
    if (trigger.host !== host) continue;
    if (!trigger.requestId) continue;
    if (
      !Number.isFinite(trigger.createdAt) ||
      now - trigger.createdAt > STRIPPED_MARKER_RECOVERY_TTL_MS
    ) {
      continue;
    }
    if (normalizeDirectDownloadHostFromUrl(trigger.sourceUrl) !== host)
      continue;

    const key = getSourceKey(trigger.sourceUrl);
    const current = sourceGroups.get(key);
    if (!current || trigger.createdAt > current.createdAt) {
      sourceGroups.set(key, trigger);
    }
  }

  return sourceGroups;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDirectDownloadHostFromUrl(url) {
  try {
    return normalizeDirectDownloadHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

function getSourceKey(sourceUrl) {
  try {
    const parsed = new URL(sourceUrl);
    parsed.hash = "";
    for (const key of [
      AUTOMATION_MARKER_KEY,
      "f95ue_tab",
      DIRECT_DOWNLOAD_ROUTE_TS_KEY,
      DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY,
    ]) {
      parsed.searchParams.delete(key);
    }
    return parsed.href;
  } catch {
    return String(sourceUrl || "").trim();
  }
}

function getCurrentPageFileIdentifier(host) {
  if (host !== "datanodes.to") return "";
  return getDatanodesPageFileIdentifier();
}

function getDatanodesPageFileIdentifier() {
  try {
    const headings = Array.from(document.querySelectorAll("h4"));
    for (const heading of headings) {
      if (normalizeFileIdentifier(heading.textContent) !== "downloading")
        continue;
      const container = heading.parentElement?.parentElement;
      const title = findDatanodesTitleCandidate(container);
      if (title) return title;
    }

    return findDatanodesTitleCandidate(document);
  } catch {
    return "";
  }
}

function findDatanodesTitleCandidate(root) {
  if (!root?.querySelectorAll) return "";
  const candidates = Array.from(root.querySelectorAll("div,span,h1,h2,h3"));
  for (const element of candidates) {
    const className = String(element.className || "");
    if (!className.includes("font-bold")) continue;
    const text = normalizeFileIdentifier(element.textContent);
    if (isLikelyFileIdentifier(text)) return text;
  }
  return "";
}

function getSourceFileIdentifier(sourceUrl) {
  try {
    const parsed = new URL(sourceUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1] || "";
    return decodeURIComponent(lastSegment.replace(/\+/g, " "));
  } catch {
    return "";
  }
}

function normalizeFileIdentifier(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isLikelyFileIdentifier(value) {
  if (!value || value === "downloading") return false;
  if (/^\d+(?:\.\d+)?\s*(?:b|kb|mb|gb|tb)$/i.test(value)) return false;
  return /[._-]/.test(value) || /\.[a-z0-9]{2,6}$/i.test(value);
}

function restoreRouteMarkersFromTrigger(trigger, originTabQueryKey) {
  try {
    if (shouldKeepRouteMarkersInSession()) {
      writeRouteContext(
        {
          ownerTabId: trigger.ownerTabId,
          requestId: trigger.requestId,
          createdAt: trigger.createdAt,
          host: trigger.host,
          sourceUrl: trigger.sourceUrl,
        },
        originTabQueryKey,
      );
      return;
    }

    const parsed = new URL(location.href);
    if (!parsed.searchParams.get(AUTOMATION_MARKER_KEY)) {
      parsed.searchParams.set(AUTOMATION_MARKER_KEY, "1");
    }
    if (trigger.ownerTabId && !parsed.searchParams.get(originTabQueryKey)) {
      parsed.searchParams.set(originTabQueryKey, trigger.ownerTabId);
    }
    if (
      trigger.requestId &&
      !parsed.searchParams.get(DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY)
    ) {
      parsed.searchParams.set(
        DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY,
        trigger.requestId,
      );
    }
    if (
      Number.isFinite(trigger.createdAt) &&
      !parsed.searchParams.get(DIRECT_DOWNLOAD_ROUTE_TS_KEY)
    ) {
      parsed.searchParams.set(
        DIRECT_DOWNLOAD_ROUTE_TS_KEY,
        String(trigger.createdAt),
      );
    }
    window.history?.replaceState?.(
      window.history.state,
      document.title,
      parsed.href,
    );
  } catch {
    // best effort
  }
}

function shouldKeepRouteMarkersInSession() {
  try {
    return (
      normalizeDirectDownloadHost(location.hostname) === "datanodes.to" &&
      location.pathname.startsWith("/download")
    );
  } catch {
    return false;
  }
}

export const __downloadPageControllerTestInternals = {
  findSingleStrippedMarkerTrigger,
  getSourceFileIdentifier,
  normalizeFileIdentifier,
};
