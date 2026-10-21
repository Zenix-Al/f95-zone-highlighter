import { normalizeDownloadCloseDelay } from "../../shared/downloadCloseDelay.js";
import { isDirectDownloadHostEnabled } from "../../hosts/metadata.js";

// One local operation per destination tab; no origin request or tab handles.
export function createDirectDownloadFlowController({
  addonId,
  diagnostics,
  getPolicy = async () => null,
  closeTab = () => window.close(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  publishFeedback = async () => false,
}) {
  function createHostExecutionContext(decision, hooks = {}) {
    const host = String(decision?.host || "unknown");
    let timer = null;
    let disposed = false;
    let settled = false;
    function feedback(outcome) {
      void Promise.resolve()
        .then(() => publishFeedback({ host, outcome }))
        .catch(() => {});
    }
    function dispose() {
      disposed = true;
      if (timer !== null) clearTimeoutFn(timer);
      timer = null;
    }
    return {
      mode: "standalone",
      request: null,
      dispose,
      async notifyMainFailure(_hostLabel, _message, errorCode = "") {
        if (disposed) return;
        dispose();
        feedback("failure");
        diagnostics.warn(errorCode || "standalone_download_failed", { host });
        hooks.onStandaloneFailure?.();
        hooks.onSettled?.();
      },
      async notifyChallenge() {
        if (disposed) return;
        if (timer !== null) clearTimeoutFn(timer);
        timer = null;
        diagnostics.warn("standalone_challenge", { host });
        feedback("challenge");
      },
      reportAddonHealthy(evidence = {}) {
        if (disposed || settled) return;
        settled = true;
        hooks.onStandaloneSuccess?.();
        if (evidence.downloadTriggered !== true) {
          hooks.onSettled?.();
          return;
        }
        console.info(`[${addonId}] standalone_download_triggered`, { host });
        feedback("initiated");
        // Healthy/no-op branches never authorize closing. Only explicit final-action
        // evidence does, and settings/challenge state are checked again at the deadline.
        if (decision?.policy?.autoCloseTabs !== true) {
          hooks.onSettled?.();
          return;
        }
        timer = setTimeoutFn(async () => {
          timer = null;
          try {
            const policy = await getPolicy();
            if (
              !disposed &&
              policy?.effectiveAutomateRegardless &&
              policy.autoCloseTabs === true &&
              isDirectDownloadHostEnabled(host, policy.directDownloadPackages) &&
              hooks.canClose?.() !== false
            )
              closeTab();
          } catch {
            /* A refused close or unavailable policy leaves the tab open. */
          } finally {
            hooks.onSettled?.();
          }
        }, normalizeDownloadCloseDelay(decision.policy.downloadPageCloseDelayMs));
      },
    };
  }
  return { createHostExecutionContext };
}
