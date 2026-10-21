import {
  normalizeDirectDownloadHost,
  isDirectDownloadHostEnabled,
  findDirectDownloadHost,
  isExactDirectDownloadHost,
} from "../../hosts/metadata.js";
import { createCloudflareChallengeMonitor } from "../../hosts/shared/cloudflareChallenge.js";
import {
  classifyStandaloneHostRoute,
  describeStandaloneContinuation,
  describeStandaloneEntry,
} from "../../hosts/standaloneEligibility.js";
import { createStandaloneRunGuard } from "../../ports/standaloneRunGuard.js";
import { createStandaloneContinuationStore } from "../../ports/standaloneContinuation.js";

export function createDownloadPageController({
  addonId,
  debugLog,
  getIsEnabled,
  handlers,
  getStandalonePolicy,
  createHostExecutionContext,
  createChallengeMonitor = createCloudflareChallengeMonitor,
  createContinuationStore = createStandaloneContinuationStore,
}) {
  let continuationStore = null;
  let activeRun = null;

  function getContinuationStore() {
    continuationStore ||= createContinuationStore();
    return continuationStore;
  }
  function getDownloadHost() {
    return normalizeDirectDownloadHost(location.hostname);
  }

  async function decideHostAutomation(host) {
    if (!host) return blockedDecision(host, "unsupported_host");
    const packageInfo = findDirectDownloadHost(location.hostname);
    if (
      !packageInfo ||
      packageInfo.canonicalHost !== host ||
      !isExactDirectDownloadHost(packageInfo.id, location.hostname)
    ) {
      return blockedDecision(host, "unsupported_host");
    }
    if (!getIsEnabled()) return blockedDecision(host, "addon_disabled");
    let policy = null;
    try {
      policy = await getStandalonePolicy?.();
    } catch {
      policy = null;
    }
    if (!policy?.effectiveAutomateRegardless) {
      return blockedDecision(host, policy?.needsSettingsRefresh ? "settings_refresh_required" : "standalone_policy_disabled");
    }
    if (!isDirectDownloadHostEnabled(host, policy.directDownloadPackages)) {
      return blockedDecision(host, "host_disabled");
    }
    const route = classifyStandaloneHostRoute(host, location.href);
    if (!route.eligible) {
      const continuation = describeStandaloneContinuation(host, location.href);
      if (!continuation) return blockedDecision(host, route.reason);
      const operation = getContinuationStore().inspect({
        host,
        identity: continuation.identity,
        stage: continuation.nextStage,
      });
      if (!operation) return blockedDecision(host, "standalone_continuation_not_owned");
      return {
        mode: "standalone",
        host,
        reason: "standalone_owned_continuation",
        request: null,
        policy,
        standaloneContinuation: continuation,
        standaloneOperation: operation,
      };
    }
    const entry = describeStandaloneEntry(host, location.href);
    if (entry?.consumeExisting) {
      const operation = getContinuationStore().inspect({
        host,
        identity: entry.identity,
        stage: entry.nextStage,
      });
      if (operation) {
        return {
          mode: "standalone",
          host,
          reason: "standalone_owned_continuation",
          request: null,
          policy,
          standaloneContinuation: entry,
          standaloneOperation: operation,
        };
      }
    }
    return {
      mode: "standalone",
      host,
      reason: route.reason,
      request: null,
      policy,
      standaloneEntry: entry,
    };
  }

  async function shouldRunHostAutomation(host) {
    return (await decideHostAutomation(host)).mode === "standalone";
  }

  function runDownloadPageHooks() {
    if (activeRun) return activeRun;
    activeRun = executeDownloadPageHooks().finally(() => {
      activeRun = null;
    });
    return activeRun;
  }

  async function executeDownloadPageHooks() {
    if (document.readyState === "loading") {
      await new Promise((resolve) => {
        document.addEventListener("DOMContentLoaded", resolve, { once: true });
      });
    }
    const host = getDownloadHost();
    if (!host) {
      console.info(`[${addonId}] Download hooks skipped: no supported host.`);
      return;
    }

    const decision = await decideHostAutomation(host);
    if (decision.mode === "blocked") {
      console.info(
        `[${addonId}] Download hooks blocked by automation gate. host=${host} reason=${decision.reason} href=${location.href}`,
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

    const standaloneGuard = createStandaloneRunGuard();
    const standaloneRoute = location.href;
    if (standaloneGuard && !standaloneGuard.claim(host, standaloneRoute)) {
      console.info(
        `[${addonId}] Standalone host automation skipped by one-shot guard. host=${host} href=${standaloneRoute}`,
      );
      return;
    }
    const releaseIncompleteRun = () => {
      standaloneGuard?.release(host, standaloneRoute);
    };
    window.addEventListener("pagehide", releaseIncompleteRun, { once: true });
    if (decision.standaloneEntry) {
      const operation = getContinuationStore().claim({
        host,
        identity: decision.standaloneEntry.identity,
        nextStage: decision.standaloneEntry.nextStage,
      });
      if (!operation) {
        standaloneGuard?.release(host, standaloneRoute);
        console.info(`[${addonId}] Standalone continuation claim failed. host=${host}`);
        return;
      }
      decision.standaloneOperation = operation;
    }

    console.info(`[${addonId}] Download hooks running for host=${host}.`);

    let challengeMonitor;
    const executionContext =
      typeof createHostExecutionContext === "function"
        ? createHostExecutionContext(decision, {
            canClose: () => !challengeMonitor?.isBlocked(),
            onSettled: () => challengeMonitor?.dispose(),
            onStandaloneFailure: () => {
              getContinuationStore().clear(host);
              standaloneGuard?.release(host, standaloneRoute);
            },
            onStandaloneSuccess: () => {
              getContinuationStore().clear(host);
              standaloneGuard?.complete(host, standaloneRoute);
            },
          })
        : {
            mode: decision.mode,
            request: decision.request,
            notifyChallenge: async () => {},
          };
    challengeMonitor = createChallengeMonitor({
      debugLog,
      host,
      notifyChallenge: executionContext.notifyChallenge,
    });
    window.addEventListener("pagehide", () => executionContext.dispose?.(), { once: true });
    challengeMonitor.start();
    window.addEventListener("pagehide", challengeMonitor.dispose, {
      once: true,
    });
    if (!(await challengeMonitor.waitUntilClear())) {
      standaloneGuard?.release(host, standaloneRoute);
      return;
    }
    if (decision.standaloneContinuation) {
      const operation = getContinuationStore().consume({
        host,
        identity: decision.standaloneContinuation.identity,
        stage: decision.standaloneContinuation.nextStage,
      });
      if (!operation) {
        standaloneGuard?.release(host, standaloneRoute);
        console.info(
          `[${addonId}] Standalone continuation was no longer owned after challenge handling. host=${host} href=${standaloneRoute}`,
        );
        return;
      }
      decision.standaloneOperation = operation;
    }

    const exec = async () => {
      try {
        await handler(challengeMonitor, decision, executionContext);
      } catch (error) {
        console.error(`[${addonId}] Host handler failed.`, {
          host,
          mode: decision.mode,
          error,
        });
        await executionContext.notifyMainFailure?.(
          host,
          error?.message || String(error),
          "host_handler_failed",
        );
      }
    };

    await exec();
  }

  return {
    getDownloadHost,
    decideHostAutomation,
    runDownloadPageHooks,
    shouldRunHostAutomation,
  };
}

function blockedDecision(host, reason) {
  return {
    mode: "blocked",
    host: String(host || ""),
    reason,
    request: null,
  };
}
