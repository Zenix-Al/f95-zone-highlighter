let callbacks = null;
let fetchPatched = false;
let xhrPatched = false;

function xhrResponseText(xhr) {
  try {
    if (typeof xhr?.responseText === "string") return xhr.responseText;
  } catch {}
  if (typeof xhr?.response === "string") return xhr.response;
  return xhr?.response && typeof xhr.response === "object" ? JSON.stringify(xhr.response) : "";
}

export function initSandboxCaptureTransport(nextCallbacks) {
  callbacks = nextCallbacks;
  const scope = typeof globalThis !== "undefined" ? globalThis : null;
  if (!scope) return;

  if (!fetchPatched && typeof scope.fetch === "function") {
    const originalFetch = scope.fetch.bind(scope);
    scope.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const input = args[0];
      const url = String(response?.url || (typeof input === "string" ? input : input?.url) || "");
      if (callbacks?.shouldCapture("fetch", url) && response?.clone) {
        response
          .clone()
          .text()
          .then((responseText) => callbacks?.onResponse("fetch", url, responseText))
          .catch((error) => callbacks?.onError("fetch", url, error));
      }
      return response;
    };
    fetchPatched = true;
  }

  const Xhr = scope.XMLHttpRequest;
  if (!xhrPatched && Xhr?.prototype) {
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
          if (!callbacks?.shouldCapture("xhr", url)) return;
          try {
            callbacks.onResponse("xhr", url, xhrResponseText(this));
          } catch (error) {
            callbacks.onError("xhr", url, error);
          }
        });
      }
      return originalSend.apply(this, args);
    };
    xhrPatched = true;
  }
}

export function deactivateSandboxCaptureTransport() {
  callbacks = null;
}

export const resetSandboxCaptureTransportForTests = deactivateSandboxCaptureTransport;
