import { AUTOMATION_MARKER_KEY } from "../../constants.js";
import {
  DIRECT_DOWNLOAD_ROUTE_REQUEST_ID_KEY,
  DIRECT_DOWNLOAD_ROUTE_TS_KEY,
  DIRECT_DOWNLOAD_ROUTE_TTL_MS,
} from "../../constants.js";
import {
  isProcessingDownloadTriggerActive,
  readProcessingDownloadTrigger,
  readProcessingDownloadTriggerBySource,
  updateProcessingDownloadTrigger,
} from "../../ports/processingDownloadRepository.js";
import { normalizeDirectDownloadHost } from "../../hosts/metadata.js";
import {
  getRouteRequestId,
  readRouteContext,
  writeRouteContext,
} from "../../ports/routeContextRepository.js";
import { sleep } from "../../shared/utils.js";
import { createCloudflareChallengeMonitor } from "../../hosts/shared/cloudflareChallenge.js";

const DATANODES_IDENTIFIER_WAIT_MS = 15 * 1000;
const DATANODES_IDENTIFIER_POLL_MS = 250;

export function createDownloadPageController({
  addonId,
  debugLog,
  GMApi,
  getIsBlockedByCore,
  getIsEnabled,
  handlers,
  notifyChallenge,
  originTabQueryKey,
  onManagedRequestResolved,
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

    const sessionContext = readRouteContext(originTabQueryKey, {
      expectedHost: host,
    });
    let exactRequestId = requestId || sessionContext?.requestId || "";
    let recoveredBySource = false;
    if (!exactRequestId && isRecoverableMarkerlessDownload(host)) {
      const recovered =
        host === "datanodes.to"
          ? await recoverMarkerlessDatanodesRequest(GMApi)
          : host === "download.gg"
            ? await recoverMarkerlessDownloadGgRequest(GMApi)
            : host === "vik1ngfile.site"
              ? await recoverMarkerlessVik1ngfileRequest(GMApi)
            : await recoverMarkerlessGoogleDriveRequest(GMApi);
      if (recovered.active) {
        restoreRouteMarkersFromTrigger(recovered, originTabQueryKey);
        exactRequestId = recovered.requestId;
        recoveredBySource = true;
        debugLog(
          "DownloadHooks",
          "Recovered exact markerless request from source identity.",
          {
            host,
            requestId: recovered.requestId,
          },
        );
      }
    }
    const trigger = exactRequestId
      ? await readProcessingDownloadTrigger(GMApi, {
          requestId: exactRequestId,
        })
      : null;
    if (trigger && isProcessingDownloadTriggerActive(trigger)) {
      const hostMatches = !trigger.host || trigger.host === host;
      const expectedOwnerTabId =
        originTabId || sessionContext?.originTabId || "";
      const tabMatches =
        !trigger.ownerTabId ||
        recoveredBySource ||
        (expectedOwnerTabId && trigger.ownerTabId === expectedOwnerTabId);
      const urlMarkersFresh =
        marker === "1" &&
        Boolean(requestId) &&
        Number.isFinite(routeTs) &&
        routeTs > 0 &&
        Date.now() - routeTs <= DIRECT_DOWNLOAD_ROUTE_TTL_MS;
      const sessionMatches =
        sessionContext?.requestId === trigger.requestId &&
        (!sessionContext.host || sessionContext.host === host);
      if (
        hostMatches &&
        tabMatches &&
        (urlMarkersFresh || sessionMatches || recoveredBySource)
      ) {
        restoreRouteMarkersFromTrigger(trigger, originTabQueryKey);
        onManagedRequestResolved?.(trigger);
        return true;
      }
    }

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

    const challengeMonitor = createCloudflareChallengeMonitor({
      debugLog,
      host,
      notifyChallenge,
      preserveRequest: async () => {
        const requestId = getRouteRequestId();
        if (!requestId) return;
        await updateProcessingDownloadTrigger(GMApi, requestId, {
          expiresAt: Date.now() + DIRECT_DOWNLOAD_ROUTE_TTL_MS,
        });
      },
    });
    challengeMonitor.start();
    window.addEventListener("pagehide", challengeMonitor.dispose, {
      once: true,
    });
    if (!(await challengeMonitor.waitUntilClear())) return;

    const exec = () => handler(challengeMonitor);

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
    shouldRunHostAutomation,
  };
}

function isMarkerlessDatanodesDownload(host) {
  return host === "datanodes.to" && location.pathname.startsWith("/download");
}

function isRecoverableMarkerlessDownload(host) {
  return (
    isMarkerlessDatanodesDownload(host) ||
    (host === "download.gg" &&
      /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?file-/i.test(location.pathname)) ||
    (host === "vik1ngfile.site" && location.pathname.startsWith("/f/")) ||
    (host === "drive.google.com" &&
      ((location.hostname === "drive.usercontent.google.com" &&
        location.pathname.startsWith("/download")) ||
        (location.hostname === "drive.google.com" &&
          (location.pathname.startsWith("/file/d/") ||
            location.pathname === "/open" ||
            location.pathname === "/uc"))))
  );
}

async function recoverMarkerlessVik1ngfileRequest(GMApi) {
  const sourceIdentifier = location.pathname.split("/").filter(Boolean).at(-1);
  if (!sourceIdentifier) return { active: false };
  return readProcessingDownloadTriggerBySource(GMApi, {
    host: "vik1ngfile.site",
    sourceIdentifier,
  });
}

async function recoverMarkerlessDownloadGgRequest(GMApi) {
  return readProcessingDownloadTriggerBySource(GMApi, {
    host: "download.gg",
    sourceIdentifier: location.pathname.replace(/\/+$/, ""),
  });
}

async function recoverMarkerlessGoogleDriveRequest(GMApi) {
  const sourceIdentifier = getGoogleDrivePageFileIdentifier();
  if (!sourceIdentifier) return { active: false };
  return readProcessingDownloadTriggerBySource(GMApi, {
    host: "drive.google.com",
    sourceIdentifier,
  });
}

function getGoogleDrivePageFileIdentifier() {
  try {
    const parsed = new URL(location.href);
    const pathMatch = parsed.pathname.match(/^\/file\/d\/([^/]+)/);
    return String(
      pathMatch?.[1] || parsed.searchParams.get("id") || "",
    ).trim();
  } catch {
    return "";
  }
}

async function recoverMarkerlessDatanodesRequest(GMApi) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < DATANODES_IDENTIFIER_WAIT_MS) {
    const sourceIdentifier = getDatanodesPageFileIdentifier();
    if (sourceIdentifier) {
      return readProcessingDownloadTriggerBySource(GMApi, {
        host: "datanodes.to",
        sourceIdentifier,
      });
    }
    await sleep(DATANODES_IDENTIFIER_POLL_MS);
  }
  return { active: false };
}

function getDatanodesPageFileIdentifier() {
  try {
    const headings = Array.from(document.querySelectorAll("h4"));
    for (const heading of headings) {
      if (normalizeFileIdentifier(heading.textContent) !== "downloading")
        continue;
      const title = findDatanodesTitleCandidate(
        heading.parentElement?.parentElement,
      );
      if (title) return title;
    }
    return findDatanodesTitleCandidate(document);
  } catch {
    return "";
  }
}

function findDatanodesTitleCandidate(root) {
  if (!root?.querySelectorAll) return "";
  for (const element of root.querySelectorAll("div,span,h1,h2,h3")) {
    if (!String(element.className || "").includes("font-bold")) continue;
    const text = normalizeFileIdentifier(element.textContent);
    if (
      text &&
      text !== "downloading" &&
      !/^\d+(?:\.\d+)?\s*(?:b|kb|mb|gb|tb)$/i.test(text) &&
      (/[._-]/.test(text) || /\.[a-z0-9]{2,6}$/i.test(text))
    ) {
      return text;
    }
  }
  return "";
}

function normalizeFileIdentifier(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function restoreRouteMarkersFromTrigger(trigger, originTabQueryKey) {
  try {
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

    if (shouldKeepRouteMarkersInSession()) {
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
    const host = normalizeDirectDownloadHost(location.hostname);
    return (
      (host === "datanodes.to" && location.pathname.startsWith("/download")) ||
      (host === "download.gg" &&
        /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?file-/i.test(location.pathname)) ||
      (host === "vik1ngfile.site" && location.pathname.startsWith("/f/")) ||
      host === "drive.google.com"
    );
  } catch {
    return false;
  }
}
