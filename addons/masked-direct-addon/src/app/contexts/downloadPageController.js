import { isAutomationEnabled } from "../../shared/utils.js";
import {
  normalizeDirectDownloadHost,
  isDirectDownloadHostEnabled,
  findDirectDownloadHost,
  isExactDirectDownloadHost,
} from "../../hosts/metadata.js";
import { createCloudflareChallengeMonitor } from "../../hosts/shared/cloudflareChallenge.js";
import {
  classifyHostRoute,
  describeHostContinuation,
  describeHostEntry,
} from "../../hosts/hostRoutes.js";
import { createStandaloneRunGuard } from "../../ports/standaloneRunGuard.js";
import { createStandaloneContinuationStore } from "../../ports/standaloneContinuation.js";
import { createHostRunScope } from "../../hosts/shared/runScope.js";

export function createDownloadPageController({
  addonId,
  debugLog,
  getIsEnabled,
  handlers,
  getAutomationSettings,
  createHostExecutionContext,
  createChallengeMonitor = createCloudflareChallengeMonitor,
  createContinuationStore = createStandaloneContinuationStore,
}) {
  let continuationStore = null;
  let activeRun = null;
  let scope = null;

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
    let automationSettings = null;
    try {
      automationSettings = await getAutomationSettings?.();
    } catch {
      automationSettings = null;
    }
    if (!isAutomationEnabled(automationSettings)) {
      return blockedDecision(
        host,
        automationSettings?.needsSettingsRefresh
          ? "settings_refresh_required"
          : "automation_disabled",
      );
    }
    if (!isDirectDownloadHostEnabled(host, automationSettings.directDownloadPackages)) {
      return blockedDecision(host, "host_disabled");
    }
    const route = classifyHostRoute(host, location.href);
    if (!route.eligible) {
      const continuation = describeHostContinuation(host, location.href);
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
        automationSettings,
        standaloneContinuation: continuation,
        standaloneOperation: operation,
      };
    }
    const entry = describeHostEntry(host, location.href);
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
          automationSettings,
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
      automationSettings,
      standaloneEntry: entry,
    };
  }

  async function shouldRunHostAutomation(host) {
    return (await decideHostAutomation(host)).mode === "standalone";
  }

  function runDownloadPageHooks() {
    if (activeRun) return activeRun;
    if (scope?.current()) return Promise.resolve();
    activeRun = executeDownloadPageHooks().finally(() => {
      activeRun = null;
    });
    return activeRun;
  }

  async function executeDownloadPageHooks() {
    const standaloneRoute = location.href;
    const run = createHostRunScope(() => getIsEnabled() && location.href === standaloneRoute);
    scope = run;
    const onPageHide = () => run.dispose();
    window.addEventListener("pagehide", onPageHide, { once: true });
    run.own(() => window.removeEventListener("pagehide", onPageHide));
    const onRouteChange = () => run.current();
    for (const type of ["hashchange", "popstate"]) {
      window.addEventListener(type, onRouteChange);
      run.own(() => window.removeEventListener(type, onRouteChange));
    }
    try {
      if (document.readyState === "loading") {
        await new Promise((resolve) => {
          const ready = () => {
            document.removeEventListener("DOMContentLoaded", ready);
            run.signal.removeEventListener("abort", ready);
            resolve();
          };
          document.addEventListener("DOMContentLoaded", ready, { once: true });
          run.signal.addEventListener("abort", ready, { once: true });
        });
      }
      if (!run.current()) return;
      const host = getDownloadHost();
      if (!host) {
        console.info(`[${addonId}] Download hooks skipped: no supported host.`);
        run.dispose();
        return;
      }

      const decision = await decideHostAutomation(host);
      if (!run.current()) return;
      if (decision.mode === "blocked") {
        console.info(
          `[${addonId}] Download hooks blocked by automation gate. host=${host} reason=${decision.reason} href=${location.href}`,
        );
        debugLog("DownloadHooks", "Automation gate blocked host run.", {
          host,
          href: location.href,
          referrer: document.referrer || "",
        });
        run.dispose();
        return;
      }

      const handler = handlers[host];
      if (!handler) {
        console.info(`[${addonId}] Download hooks skipped: no handler for host=${host}.`);
        run.dispose();
        return;
      }

      const standaloneGuard = createStandaloneRunGuard();
      if (standaloneGuard && !standaloneGuard.claim(host, standaloneRoute)) {
        console.info(
          `[${addonId}] Standalone host automation skipped by one-shot guard. host=${host} href=${standaloneRoute}`,
        );
        run.dispose();
        return;
      }
      run.own(() => standaloneGuard?.release(host, standaloneRoute));
      if (decision.standaloneEntry) {
        const operation = getContinuationStore().claim({
          host,
          identity: decision.standaloneEntry.identity,
          nextStage: decision.standaloneEntry.nextStage,
        });
        if (!operation) {
          standaloneGuard?.release(host, standaloneRoute);
          console.info(`[${addonId}] Standalone continuation claim failed. host=${host}`);
          run.dispose();
          return;
        }
        decision.standaloneOperation = operation;
      }

      console.info(`[${addonId}] Download hooks running for host=${host}.`);

      let challengeMonitor;
      const context =
        typeof createHostExecutionContext === "function"
          ? createHostExecutionContext(decision, {
              canClose: () => run.current() && !challengeMonitor?.isBlocked(),
              onSettled: () => run.dispose(),
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
      const executionContext = {
        ...context,
        notifyMainFailure: (...args) =>
          run.current() ? context.notifyMainFailure?.(...args) : undefined,
        notifyChallenge: (...args) =>
          run.current() ? context.notifyChallenge?.(...args) : undefined,
        reportAddonHealthy: (...args) => {
          if (run.current()) context.reportAddonHealthy?.(...args);
        },
      };
      run.own(() => executionContext.dispose?.());
      challengeMonitor = createChallengeMonitor({
        debugLog,
        host,
        notifyChallenge: executionContext.notifyChallenge,
      });
      run.own(() => challengeMonitor.dispose());
      challengeMonitor.start();
      const gate = {
        signal: run.signal,
        isBlocked: () => !run.current() || challengeMonitor.isBlocked(),
        waitUntilClear: async () => {
          if (!run.current()) return false;
          const clear = await challengeMonitor.waitUntilClear();
          if (!clear) run.dispose();
          return clear && run.current();
        },
      };
      if (!(await gate.waitUntilClear())) {
        run.dispose();
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
          run.dispose();
          return;
        }
        decision.standaloneOperation = operation;
      }

      const exec = async () => {
        try {
          await handler(gate, decision, executionContext);
        } catch (error) {
          if (!run.current() || error?.name === "AbortError") {
            run.dispose();
            return;
          }
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
          run.dispose();
        }
      };

      await exec();
      // Navigation stages and Datanodes' asynchronous scanner intentionally retain
      // the scope until a terminal callback or pagehide, not merely handler return.
    } catch (error) {
      run.dispose();
      if (error?.name !== "AbortError") throw error;
    }
  }

  return {
    getDownloadHost,
    decideHostAutomation,
    runDownloadPageHooks,
    shouldRunHostAutomation,
    dispose: () => scope?.dispose(),
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
