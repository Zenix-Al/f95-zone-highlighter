import {
  isLatestDataRequest,
  normalizeLatestAjaxErrorPayload,
  shouldRetryLatestAjaxError,
} from "./policy.js";

export const LATEST_AJAX_RECOVERY_MARKER = "__f95ueSiteRepairLatestAjax";
const PARSER_MESSAGE = "Latest returned an invalid response. Retrying once...";
const FALLBACK_MESSAGE = "Unable to fetch data, please try again";

export function createLatestAjaxJqueryAdapter({
  window: windowLike = window,
  pollIntervalMs = 10,
  maxPollAttempts = 500,
  parserRetryDelayMs = 350,
  retryDelayMs = 800,
} = {}) {
  let enabled = false;
  let generation = 0;
  let originalAjax = null;
  let patchedAjax = null;
  let patchedOwner = null;
  let pollTimer = 0;
  let pollAttempts = 0;
  const retryTimers = new Set();

  function exposeLatestXhr(jqXHR) {
    try { windowLike.xhr = jqXHR; } catch { /* best-effort site compatibility */ }
  }

  function clearOwnedTimers() {
    if (pollTimer) windowLike.clearInterval(pollTimer);
    pollTimer = 0;
    for (const timer of retryTimers) windowLike.clearTimeout(timer);
    retryTimers.clear();
  }

  function patch(candidate) {
    if (!candidate || typeof candidate.ajax !== "function") return false;
    if (candidate.ajax === patchedAjax) return true;
    if (candidate.ajax[LATEST_AJAX_RECOVERY_MARKER]) return true;

    originalAjax = candidate.ajax;
    patchedOwner = candidate;
    patchedAjax = function siteRepairLatestAjax(urlOrSettings, maybeSettings) {
      const objectCall = Boolean(urlOrSettings && typeof urlOrSettings === "object");
      const settings = objectCall
        ? { ...urlOrSettings }
        : { ...(maybeSettings || {}), url: urlOrSettings };
      if (!isLatestDataRequest(settings)) return originalAjax.apply(this, arguments);

      const originalError = settings.error;
      const ajaxThis = this;
      settings.error = function siteRepairLatestAjaxError(jqXHR, textStatus, errorThrown) {
        normalizeLatestAjaxErrorPayload(
          jqXHR,
          textStatus === "parsererror" ? PARSER_MESSAGE : FALLBACK_MESSAGE,
        );
        exposeLatestXhr(jqXHR);
        if (enabled && !settings.__f95ueSiteRepairRetried && shouldRetryLatestAjaxError(textStatus, jqXHR)) {
          const retryGeneration = generation;
          const timer = windowLike.setTimeout(() => {
            retryTimers.delete(timer);
            if (!enabled || generation !== retryGeneration || !originalAjax) return;
            settings.__f95ueSiteRepairRetried = true;
            originalAjax.call(ajaxThis, { ...settings, __f95ueSiteRepairRetried: true });
          }, textStatus === "parsererror" ? parserRetryDelayMs : retryDelayMs);
          retryTimers.add(timer);
          return undefined;
        }
        return typeof originalError === "function"
          ? originalError.call(this, jqXHR, textStatus, errorThrown)
          : undefined;
      };

      return objectCall
        ? originalAjax.call(this, settings)
        : originalAjax.call(this, settings.url, settings);
    };
    try { Object.assign(patchedAjax, originalAjax); } catch { /* optional jQuery metadata */ }
    patchedAjax[LATEST_AJAX_RECOVERY_MARKER] = true;
    patchedAjax.__f95ueOriginalAjax = originalAjax;
    candidate.ajax = patchedAjax;
    return true;
  }

  function tryPatch() {
    return patch(windowLike.jQuery) || patch(windowLike.$);
  }

  function enable() {
    enabled = true;
    if (tryPatch() || pollTimer) return;
    pollAttempts = 0;
    pollTimer = windowLike.setInterval(() => {
      pollAttempts += 1;
      if (!enabled || tryPatch() || pollAttempts >= maxPollAttempts) {
        windowLike.clearInterval(pollTimer);
        pollTimer = 0;
      }
    }, pollIntervalMs);
  }

  function disable() {
    enabled = false;
    generation += 1;
    clearOwnedTimers();
    for (const candidate of new Set([patchedOwner, windowLike.jQuery, windowLike.$].filter(Boolean))) {
      if (candidate.ajax === patchedAjax && originalAjax) candidate.ajax = originalAjax;
    }
    originalAjax = null;
    patchedAjax = null;
    patchedOwner = null;
  }

  function getSnapshot() {
    return {
      enabled,
      generation,
      patched: Boolean(patchedAjax),
      polling: Boolean(pollTimer),
      pendingRetries: retryTimers.size,
    };
  }

  return { enable, disable, getSnapshot };
}
