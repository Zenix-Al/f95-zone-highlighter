import { debugLog } from "../../../../shared/debugLog.js";

export const LATEST_AJAX_RECOVERY_MARKER = "__f95ueSiteRepairLatestAjax";
export const LATEST_AJAX_COMMAND_EVENT = "f95ue:site-repair:latest-ajax-command";
export const LATEST_AJAX_STATUS_EVENT = "f95ue:site-repair:latest-ajax-status";

function createLatestAjaxPageScript({
  pollIntervalMs,
  maxPollAttempts,
  parserRetryDelayMs,
  retryDelayMs,
}) {
  return `
(() => {
  const marker = ${JSON.stringify(LATEST_AJAX_RECOVERY_MARKER)};
  const commandEvent = ${JSON.stringify(LATEST_AJAX_COMMAND_EVENT)};
  const statusEvent = ${JSON.stringify(LATEST_AJAX_STATUS_EVENT)};
  const root = document.documentElement;
  if (!root || root.dataset[marker] === "1") return;
  root.dataset[marker] = "1";

  const latestDataPattern = /(?:^|\\/|\\b)latest_data\\.php(?:\\?|$)/;
  const state = {
    enabled: false,
    retryEnabled: false,
    generation: 0,
    originalAjax: null,
    patchedAjax: null,
    patchedOwner: null,
    pollTimer: 0,
    pollAttempts: 0,
    retryTimers: new Set(),
    siteRetryPending: false,
  };

  function debugLog(message, data) {
    console.info("[site-repair-addon:page] " + message, data || "");
  }

  function emit(type, detail = {}) {
    window.dispatchEvent(new CustomEvent(statusEvent, {
      detail: {
        type,
        enabled: state.enabled,
        retryEnabled: state.retryEnabled,
        patched: Boolean(state.patchedAjax),
        polling: Boolean(state.pollTimer),
        pendingRetries: state.retryTimers.size,
        ...detail,
      },
    }));
  }

  function normalizeErrorPayload(jqXHR, textStatus) {
    if (!jqXHR || typeof jqXHR !== "object") return false;
    if (jqXHR.responseJSON && typeof jqXHR.responseJSON === "object") return false;
    try {
      jqXHR.responseJSON = {
        msg: textStatus === "parsererror"
          ? "Latest returned an invalid response. Retrying once..."
          : "Unable to fetch data, please try again",
      };
      return true;
    } catch {
      return false;
    }
  }

  function shouldRetry(textStatus, jqXHR) {
    const status = Number(jqXHR && jqXHR.status || 0);
    if (status === 403 || status === 429) return false;
    return textStatus === "parsererror"
      || textStatus === "timeout"
      || status === 0
      || status >= 500;
  }

  function isLatestDataRequest(settings) {
    return latestDataPattern.test(String(settings && settings.url || ""));
  }

  function clearTimers() {
    if (state.pollTimer) window.clearInterval(state.pollTimer);
    state.pollTimer = 0;
    for (const timer of state.retryTimers) window.clearTimeout(timer);
    state.retryTimers.clear();
  }

  function patch(candidate) {
    if (!candidate || typeof candidate.ajax !== "function") return false;
    if (candidate.ajax === state.patchedAjax) return true;
    if (candidate.ajax[marker]) return true;

    state.originalAjax = candidate.ajax;
    state.patchedOwner = candidate;
    state.patchedAjax = function siteRepairLatestAjax(urlOrSettings, maybeSettings) {
      const objectCall = Boolean(urlOrSettings && typeof urlOrSettings === "object");
      const settings = objectCall
        ? { ...urlOrSettings }
        : { ...(maybeSettings || {}), url: urlOrSettings };
      if (!isLatestDataRequest(settings)) return state.originalAjax.apply(this, arguments);
      if (state.siteRetryPending) {
        state.siteRetryPending = false;
        settings.__f95ueSiteRepairRetried = true;
        debugLog("Claimed site-owned Latest retry request.", { url: settings.url });
      }

      const originalError = settings.error;
      const ajaxThis = this;
      settings.error = function siteRepairLatestAjaxError(jqXHR, textStatus, errorThrown) {
        const normalized = normalizeErrorPayload(jqXHR, textStatus);
        try { window.xhr = jqXHR; } catch {}
        debugLog("Intercepted Latest Ajax failure.", {
          url: settings.url,
          status: Number(jqXHR && jqXHR.status || 0),
          textStatus,
          normalized,
          retryEnabled: state.retryEnabled,
          retried: Boolean(settings.__f95ueSiteRepairRetried),
        });

        if (
          state.enabled
          && state.retryEnabled
          && !settings.__f95ueSiteRepairRetried
          && shouldRetry(textStatus, jqXHR)
        ) {
          const retryGeneration = state.generation;
          emit("repair", {
            kind: "latest-ajax",
            status: Number(jqXHR && jqXHR.status || 0),
            textStatus: String(textStatus || "error"),
            url: String(settings.url || ""),
          });
          if (typeof originalError === "function") {
            originalError.call(this, jqXHR, textStatus, errorThrown);
          }
          const timer = window.setTimeout(() => {
            state.retryTimers.delete(timer);
            debugLog("Latest retry timer fired; locating the site's Retry control.", {
              selector: "#error-box_retry-btn",
              retryGeneration,
              currentGeneration: state.generation,
              enabled: state.enabled,
            });
            if (!state.enabled || state.generation !== retryGeneration || !state.originalAjax) {
              debugLog("Cancelled stale Latest Ajax retry.", { retryGeneration });
              emit("retry-cancelled");
              return;
            }
            const retryButton = document.querySelector("#error-box_retry-btn");
            debugLog("Latest Retry control lookup completed.", {
              found: Boolean(retryButton),
              connected: Boolean(retryButton && retryButton.isConnected),
              html: retryButton && retryButton.outerHTML
                ? String(retryButton.outerHTML).slice(0, 300)
                : "",
            });
            if (retryButton && typeof retryButton.dispatchEvent === "function") {
              state.siteRetryPending = true;
              debugLog("Clicking the site's Latest Retry control.", {
                url: settings.url,
              });
              retryButton.dispatchEvent(new window.MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                view: window,
              }));
              debugLog("Latest Retry control click returned.", {
                requestClaimed: !state.siteRetryPending,
              });
              if (state.siteRetryPending) {
                state.siteRetryPending = false;
                debugLog("Site Retry control did not dispatch a Latest request.", {});
                emit("retry-unavailable");
                return;
              }
            } else {
              debugLog("Site Retry control unavailable; replaying the request as fallback.", {
                url: settings.url,
              });
              settings.__f95ueSiteRepairRetried = true;
              state.originalAjax.call(ajaxThis, {
                ...settings,
                __f95ueSiteRepairRetried: true,
              });
            }
            emit("retry-dispatched");
          }, textStatus === "parsererror"
            ? ${Number(parserRetryDelayMs)}
            : ${Number(retryDelayMs)});
          state.retryTimers.add(timer);
          debugLog("Scheduled one site-owned Latest retry.", {
            delayMs: textStatus === "parsererror"
              ? ${Number(parserRetryDelayMs)}
              : ${Number(retryDelayMs)},
            retryGeneration,
          });
          emit("retry-scheduled");
          return undefined;
        }

        return typeof originalError === "function"
          ? originalError.call(this, jqXHR, textStatus, errorThrown)
          : undefined;
      };

      return objectCall
        ? state.originalAjax.call(this, settings)
        : state.originalAjax.call(this, settings.url, settings);
    };
    try { Object.assign(state.patchedAjax, state.originalAjax); } catch {}
    state.patchedAjax[marker] = true;
    state.patchedAjax.__f95ueOriginalAjax = state.originalAjax;
    candidate.ajax = state.patchedAjax;
    debugLog("Patched page-world jQuery.ajax.", {});
    emit("patched");
    return true;
  }

  function tryPatch() {
    return patch(window.jQuery) || patch(window.$);
  }

  function enable(allowRetry) {
    state.enabled = true;
    state.retryEnabled = allowRetry === true;
    debugLog("Enable command received.", { allowRetry: state.retryEnabled });
    if (tryPatch() || state.pollTimer) {
      emit("enabled");
      return;
    }
    state.pollAttempts = 0;
    state.pollTimer = window.setInterval(() => {
      state.pollAttempts += 1;
      if (!state.enabled || tryPatch() || state.pollAttempts >= ${Number(maxPollAttempts)}) {
        window.clearInterval(state.pollTimer);
        state.pollTimer = 0;
        emit(state.patchedAjax ? "patched" : "patch-timeout");
      }
    }, ${Number(pollIntervalMs)});
    emit("polling");
  }

  function disable() {
    state.enabled = false;
    state.retryEnabled = false;
    state.siteRetryPending = false;
    state.generation += 1;
    clearTimers();
    const candidates = new Set([state.patchedOwner, window.jQuery, window.$].filter(Boolean));
    for (const candidate of candidates) {
      if (candidate.ajax === state.patchedAjax && state.originalAjax) {
        candidate.ajax = state.originalAjax;
      }
    }
    state.originalAjax = null;
    state.patchedAjax = null;
    state.patchedOwner = null;
    debugLog("Restored page-world jQuery.ajax.", { generation: state.generation });
    emit("disabled");
  }

  function onCommand(event) {
    const detail = event && event.detail || {};
    if (detail.action === "destroy") {
      disable();
      window.removeEventListener(commandEvent, onCommand);
      delete root.dataset[marker];
      debugLog("Destroy command received.", { reason: detail.reason || "" });
      emit("destroyed", { reason: String(detail.reason || "") });
      return;
    }
    if (detail.action === "disable") {
      disable();
      return;
    }
    enable(detail.allowRetry);
  }

  window.addEventListener(commandEvent, onCommand);
  debugLog("Page-world bridge installed.", {});
  emit("installed");
})();
`;
}

export function createLatestAjaxJqueryAdapter({
  window: windowLike = window,
  document: documentLike = document,
  pollIntervalMs = 10,
  maxPollAttempts = 500,
  parserRetryDelayMs = 350,
  retryDelayMs = 800,
  onRepair = () => {},
} = {}) {
  let enabled = false;
  let retryEnabled = false;
  let installed = false;
  let repairListener = onRepair;
  let statusListenerBound = false;
  let snapshot = {
    patched: false,
    polling: false,
    pendingRetries: 0,
    lastEvent: "",
  };

  function onStatus(event) {
    const detail = event?.detail || {};
    snapshot = {
      patched: detail.patched === true,
      polling: detail.polling === true,
      pendingRetries: Number(detail.pendingRetries || 0),
      lastEvent: String(detail.type || ""),
    };
    debugLog("site-repair-addon", `Latest page bridge event: ${snapshot.lastEvent}.`, {
      data: detail,
    });
    if (detail.type === "repair") {
      repairListener({
        kind: String(detail.kind || "latest-ajax"),
        status: Number(detail.status || 0),
        textStatus: String(detail.textStatus || "error"),
      });
    }
  }

  function bindStatusListener() {
    if (statusListenerBound) return;
    windowLike.addEventListener(LATEST_AJAX_STATUS_EVENT, onStatus);
    statusListenerBound = true;
  }

  function ensureBridge() {
    bindStatusListener();
    if (documentLike?.documentElement?.dataset?.[LATEST_AJAX_RECOVERY_MARKER] === "1") {
      installed = true;
      return true;
    }
    if (!documentLike?.documentElement) return false;
    const script = documentLike.createElement("script");
    script.type = "text/javascript";
    script.textContent = createLatestAjaxPageScript({
      pollIntervalMs,
      maxPollAttempts,
      parserRetryDelayMs,
      retryDelayMs,
    });
    try {
      documentLike.documentElement.appendChild(script);
      script.remove();
      installed = documentLike.documentElement.dataset[LATEST_AJAX_RECOVERY_MARKER] === "1";
      debugLog("site-repair-addon", "Latest page-world bridge injection attempted.", {
        data: { installed },
      });
      return installed;
    } catch (error) {
      script.remove?.();
      debugLog("site-repair-addon", "Latest page-world bridge injection failed.", {
        level: "error",
        data: error,
      });
      return false;
    }
  }

  function dispatch(action, detail = {}) {
    if (!ensureBridge()) return false;
    const EventConstructor = windowLike.CustomEvent || CustomEvent;
    windowLike.dispatchEvent(new EventConstructor(LATEST_AJAX_COMMAND_EVENT, {
      detail: { action, ...detail },
    }));
    debugLog("site-repair-addon", `Latest page bridge command dispatched: ${action}.`, {
      data: detail,
    });
    return true;
  }

  function enable({ allowRetry = true } = {}) {
    enabled = true;
    retryEnabled = allowRetry;
    dispatch("enable", { allowRetry });
  }

  function disable() {
    enabled = false;
    retryEnabled = false;
    if (installed) dispatch("disable");
  }

  function destroy(reason = "destroy") {
    enabled = false;
    retryEnabled = false;
    if (installed) dispatch("destroy", { reason: String(reason || "destroy") });
    if (statusListenerBound) {
      windowLike.removeEventListener(LATEST_AJAX_STATUS_EVENT, onStatus);
      statusListenerBound = false;
    }
    installed = false;
    snapshot = { patched: false, polling: false, pendingRetries: 0, lastEvent: "destroyed" };
  }

  function configure({ onRepair: nextRepairListener } = {}) {
    if (typeof nextRepairListener === "function") repairListener = nextRepairListener;
  }

  function getSnapshot() {
    return { enabled, retryEnabled, installed, ...snapshot };
  }

  return { enable, disable, destroy, configure, getSnapshot };
}
