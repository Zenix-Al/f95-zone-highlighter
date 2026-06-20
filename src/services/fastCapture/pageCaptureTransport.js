import {
  dispatchPageBridgeEvent,
  ensurePageBridge,
  subscribePageBridgeEvent,
} from "../../core/pageBridge.js";

const MARKER = "f95ue_fast_capture_bridge_installed";
const READY_MARKER = "f95ueFastCaptureBridgeReady";
const RULES_EVENT = "f95ue:fast-capture-rules";
const RESULT_EVENT = "f95ue:fast-capture-result";

function installPageCaptureBridge({ rulesEvent, resultEvent, readyMarker, initialRules }) {
  if (window.__f95ueFastCaptureBridgeInstalled) {
    document.documentElement.dataset[readyMarker] = "1";
    return;
  }
  window.__f95ueFastCaptureBridgeInstalled = true;

  const normalizeRules = (rules) =>
    Array.isArray(rules)
      ? rules.filter((rule) => Array.isArray(rule?.urlIncludes) && rule.urlIncludes.length > 0)
      : [];
  let rules = normalizeRules(initialRules);
  const matches = (transport, url) =>
    rules.some(
      (rule) =>
        (rule.transport === "any" || rule.transport === transport) &&
        rule.urlIncludes.some((needle) => String(url || "").includes(needle)),
    );
  const emit = (detail) => window.dispatchEvent(new CustomEvent(resultEvent, { detail }));
  const emitError = (transport, url, error) =>
    emit({
      transport,
      url,
      errorMessage: error?.message ? String(error.message) : String(error || "capture_failed"),
    });
  const xhrText = (xhr) => {
    try {
      if (typeof xhr.responseText === "string") return xhr.responseText;
    } catch {}
    if (typeof xhr.response === "string") return xhr.response;
    return xhr.response && typeof xhr.response === "object" ? JSON.stringify(xhr.response) : "";
  };

  window.addEventListener(rulesEvent, (event) => {
    rules = normalizeRules(event?.detail?.rules);
  });

  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const input = args[0];
      const url = String(response?.url || (typeof input === "string" ? input : input?.url) || "");
      if (matches("fetch", url) && response?.clone) {
        response
          .clone()
          .text()
          .then((responseText) => emit({ transport: "fetch", url, responseText }))
          .catch((error) => emitError("fetch", url, error));
      }
      return response;
    };
  }

  const Xhr = window.XMLHttpRequest;
  if (Xhr?.prototype) {
    const originalOpen = Xhr.prototype.open;
    const originalSend = Xhr.prototype.send;
    Xhr.prototype.open = function fastCaptureOpen(method, url, ...rest) {
      this.__f95ueFastCaptureUrl = String(url || "");
      return originalOpen.call(this, method, url, ...rest);
    };
    Xhr.prototype.send = function fastCaptureSend(...args) {
      if (!this.__f95ueFastCaptureListenerAttached) {
        this.__f95ueFastCaptureListenerAttached = true;
        this.addEventListener("loadend", () => {
          const url = String(this.responseURL || this.__f95ueFastCaptureUrl || "");
          if (!matches("xhr", url)) return;
          try {
            emit({ transport: "xhr", url, responseText: xhrText(this) });
          } catch (error) {
            emitError("xhr", url, error);
          }
        });
      }
      return originalSend.apply(this, args);
    };
  }

  document.documentElement.dataset[readyMarker] = "1";
}

let unsubscribe = null;

export function initPageCaptureTransport(rules, onResult) {
  if (!unsubscribe) unsubscribe = subscribePageBridgeEvent(RESULT_EVENT, onResult);
  const config = {
    rulesEvent: RULES_EVENT,
    resultEvent: RESULT_EVENT,
    readyMarker: READY_MARKER,
    initialRules: rules,
  };
  const injected = ensurePageBridge({
    marker: MARKER,
    scriptContent: `;(${installPageCaptureBridge.toString()})(${JSON.stringify(config)});`,
  });
  const ready =
    injected && document.documentElement?.dataset?.[READY_MARKER] === "1";
  if (injected && !ready) delete document.documentElement.dataset[MARKER];
  if (ready) dispatchPageBridgeEvent(RULES_EVENT, { rules });
  return ready;
}

export function syncPageCaptureRules(rules) {
  return dispatchPageBridgeEvent(RULES_EVENT, { rules });
}

export function resetPageCaptureTransportForTests() {
  unsubscribe?.();
  unsubscribe = null;
}
