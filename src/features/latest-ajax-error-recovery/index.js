import { createFeature } from "../../core/featureFactory.js";
import { dispatchPageBridgeEvent, ensurePageBridge } from "../../core/pageBridge.js";
import { createEnabledDisabledToast, createToggleSetting } from "../../ui/settings/metaFactory.js";

export const LATEST_AJAX_RECOVERY_MARKER = "f95ueLatestAjaxRecovery";
const LATEST_AJAX_RECOVERY_EVENT = "f95ue:latest-ajax-recovery";

export function normalizeLatestAjaxErrorPayload(
  jqXHR,
  fallbackMessage = "Unable to fetch data, please try again",
) {
  if (!jqXHR || typeof jqXHR !== "object") return false;
  if (jqXHR.responseJSON && typeof jqXHR.responseJSON === "object") return false;

  jqXHR.responseJSON = {
    msg: String(fallbackMessage || "Unable to fetch data, please try again"),
  };

  return true;
}

export function shouldRetryLatestAjaxError(textStatus, jqXHR = {}) {
  const status = Number(jqXHR?.status || 0);
  if (status === 403 || status === 429) return false;
  return textStatus === "parsererror" || textStatus === "timeout" || status === 0 || status >= 500;
}

function createLatestAjaxRecoveryScript() {
  return `
(() => {
  const marker = ${JSON.stringify(LATEST_AJAX_RECOVERY_MARKER)};
  const commandEvent = ${JSON.stringify(LATEST_AJAX_RECOVERY_EVENT)};
  const root = document.documentElement;
  if (!root || root.dataset[marker] === "1") return;
  root.dataset[marker] = "1";

  const latestDataPattern = /(?:^|\\/|\\b)latest_data\\.php(?:\\?|$)/;
  const fallbackMessage = "Unable to fetch data, please try again";
  const parserMessage = "Latest returned an invalid response. Retrying once...";
  const state = {
    enabled: false,
    originalAjax: null,
    patchedAjax: null,
    timer: 0,
    attempts: 0,
  };

  function isLatestDataRequest(settings) {
    const url = String(settings && settings.url || "");
    return latestDataPattern.test(url);
  }

  function normalizeErrorPayload(jqXHR, textStatus) {
    if (!jqXHR || typeof jqXHR !== "object") return;
    if (jqXHR.responseJSON && typeof jqXHR.responseJSON === "object") return;

    const message = textStatus === "parsererror" ? parserMessage : fallbackMessage;

    try {
      jqXHR.responseJSON = { msg: message };
    } catch {
      // Some browser objects can be odd; best effort only.
    }
  }

  function shouldRetry(textStatus, jqXHR) {
    const status = Number(jqXHR && jqXHR.status || 0);
    if (status === 403 || status === 429) return false;
    return textStatus === "parsererror" || textStatus === "timeout" || status === 0 || status >= 500;
  }

  function exposeLatestXhr(jqXHR) {
    try {
      window.xhr = jqXHR;
    } catch {
      // Non-critical compatibility helper for the site's tag error handler.
    }
  }

  function cloneAjaxSettings(settings) {
    const clone = { ...(settings || {}) };
    clone.__f95ueLatestAjaxRetried = true;
    return clone;
  }

  function patchAjax($) {
    if (!$ || typeof $.ajax !== "function") return false;
    if ($.ajax.__f95ueLatestAjaxRecovery) return true;

    state.originalAjax = $.ajax;
    state.patchedAjax = function latestAjaxRecoveryAjax(urlOrSettings, maybeSettings) {
      const isObjectCall = urlOrSettings && typeof urlOrSettings === "object";
      const settings = isObjectCall
        ? { ...urlOrSettings }
        : { ...(maybeSettings || {}), url: urlOrSettings };

      if (!isLatestDataRequest(settings)) {
        return state.originalAjax.apply(this, arguments);
      }

      const originalError = settings.error;
      const ajaxThis = this;
      settings.error = function latestAjaxRecoveryError(jqXHR, textStatus, errorThrown) {
        normalizeErrorPayload(jqXHR, textStatus);
        exposeLatestXhr(jqXHR);

        if (
          state.enabled &&
          !settings.__f95ueLatestAjaxRetried &&
          shouldRetry(textStatus, jqXHR)
        ) {
          window.setTimeout(() => {
            if (!state.enabled) return;
            const retrySettings = cloneAjaxSettings(settings);
            state.originalAjax.call(ajaxThis, retrySettings);
          }, textStatus === "parsererror" ? 350 : 800);
          return undefined;
        }

        if (typeof originalError === "function") {
          return originalError.apply(this, arguments);
        }
        return undefined;
      };

      return isObjectCall
        ? state.originalAjax.call(this, settings)
        : state.originalAjax.call(this, settings.url, settings);
    };

    try {
      Object.keys(state.originalAjax).forEach((key) => {
        state.patchedAjax[key] = state.originalAjax[key];
      });
    } catch {
      // Optional metadata copy only.
    }

    state.patchedAjax.__f95ueLatestAjaxRecovery = true;
    state.patchedAjax.__f95ueOriginalAjax = state.originalAjax;
    $.ajax = state.patchedAjax;
    return true;
  }

  function tryPatch() {
    return patchAjax(window.jQuery) || patchAjax(window.$);
  }

  function enable() {
    state.enabled = true;
    if (tryPatch()) return;

    if (state.timer) return;
    state.attempts = 0;
    state.timer = window.setInterval(() => {
      state.attempts += 1;
      if (!state.enabled || tryPatch() || state.attempts >= 500) {
        window.clearInterval(state.timer);
        state.timer = 0;
      }
    }, 10);
  }

  function disable() {
    state.enabled = false;
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = 0;
    }

    const targets = [window.jQuery, window.$].filter(Boolean);
    targets.forEach(($) => {
      if ($.ajax === state.patchedAjax && state.originalAjax) {
        $.ajax = state.originalAjax;
      }
    });
  }

  window.addEventListener(commandEvent, (event) => {
    if (event && event.detail && event.detail.enabled === false) {
      disable();
      return;
    }
    enable();
  });

  window.__f95ueLatestAjaxRecovery = { enable, disable };
})();
`;
}

function ensureLatestAjaxRecoveryBridge() {
  return ensurePageBridge({
    marker: LATEST_AJAX_RECOVERY_MARKER,
    scriptContent: createLatestAjaxRecoveryScript(),
  });
}

function enableLatestAjaxRecovery() {
  ensureLatestAjaxRecoveryBridge();
  dispatchPageBridgeEvent(LATEST_AJAX_RECOVERY_EVENT, { enabled: true });
}

function disableLatestAjaxRecovery() {
  dispatchPageBridgeEvent(LATEST_AJAX_RECOVERY_EVENT, { enabled: false });
}

export const latestAjaxErrorRecoveryFeature = createFeature("Latest Ajax Recovery", {
  configPath: "latestSettings.latestAjaxErrorRecovery",
  pageScopes: ["isLatest"],
  isApplicable: ({ stateManager }) => stateManager.get("isLatest"),
  enable: enableLatestAjaxRecovery,
  disable: disableLatestAjaxRecovery,
  settingsUi: {
    id: "latest-ajax-error-recovery",
    sectionId: "latest",
    metaMaps: [
      {
        latestAjaxErrorRecovery: createToggleSetting({
          text: "Recover latest ajax errors",
          tooltip:
            "Prevents F95 latest.min.js from crashing on invalid latest_data responses and retries the request once.",
          config: "latestSettings.latestAjaxErrorRecovery",
          custom: () => {
            latestAjaxErrorRecoveryFeature.sync();
          },
          toast: createEnabledDisabledToast("Latest Ajax Recovery"),
        }),
      },
    ],
  },
});
