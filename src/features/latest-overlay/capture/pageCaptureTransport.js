import { ensurePageBridge, subscribePageBridgeEvent } from "../../../core/pageBridge.js";

const MARKER = "f95ue_latest_capture_bridge_installed";
const READY_MARKER = "f95ueLatestCaptureBridgeReady";
const RESULT_EVENT = "f95ue:latest-capture-result";

function installPageCaptureBridge({ resultEvent, readyMarker }) {
  if (window.__f95ueLatestCaptureBridgeInstalled) {
    document.documentElement.dataset[readyMarker] = "1";
    return;
  }
  window.__f95ueLatestCaptureBridgeInstalled = true;

  const matches = (url) => String(url || "").includes("latest_data.php");
  const emit = (detail) => window.dispatchEvent(new CustomEvent(resultEvent, { detail }));
  const emitError = (transport, url, error) => emit({
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

  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const input = args[0];
      const url = String(response?.url || (typeof input === "string" ? input : input?.url) || "");
      if (matches(url) && response?.clone) {
        response.clone().text()
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
    Xhr.prototype.open = function latestCaptureOpen(method, url, ...rest) {
      this.__f95ueLatestCaptureUrl = String(url || "");
      return originalOpen.call(this, method, url, ...rest);
    };
    Xhr.prototype.send = function latestCaptureSend(...args) {
      if (!this.__f95ueLatestCaptureListenerAttached) {
        this.__f95ueLatestCaptureListenerAttached = true;
        this.addEventListener("loadend", () => {
          const url = String(this.responseURL || this.__f95ueLatestCaptureUrl || "");
          if (!matches(url)) return;
          try { emit({ transport: "xhr", url, responseText: xhrText(this) }); }
          catch (error) { emitError("xhr", url, error); }
        });
      }
      return originalSend.apply(this, args);
    };
  }

  document.documentElement.dataset[readyMarker] = "1";
}

let unsubscribe = null;

export function initPageCaptureTransport(onResult) {
  if (!unsubscribe) unsubscribe = subscribePageBridgeEvent(RESULT_EVENT, onResult);
  const config = { resultEvent: RESULT_EVENT, readyMarker: READY_MARKER };
  const injected = ensurePageBridge({
    marker: MARKER,
    scriptContent: `;(${installPageCaptureBridge.toString()})(${JSON.stringify(config)});`,
  });
  const ready = injected && document.documentElement?.dataset?.[READY_MARKER] === "1";
  if (injected && !ready) delete document.documentElement.dataset[MARKER];
  return ready;
}

export function resetPageCaptureTransportForTests() {
  unsubscribe?.();
  unsubscribe = null;
}
