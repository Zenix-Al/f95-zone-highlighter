export function ensurePageBridge({ marker, scriptContent }) {
  if (!document?.documentElement) return false;
  if (document.documentElement.dataset[marker] === "1") return true;

  const script = document.createElement("script");
  script.type = "text/javascript";
  script.textContent = scriptContent;

  try {
    document.documentElement.appendChild(script);
    script.remove();
    document.documentElement.dataset[marker] = "1";
    return true;
  } catch {
    try {
      script.remove();
    } catch {
      // ignore remove failure
    }
    return false;
  }
}

export function requestPageBridge({ requestEvent, resultEvent, detail = null, timeoutMs = 1500 }) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener(resultEvent, onResult);
      resolve(result);
    };

    const onResult = (event) => {
      finish({
        received: true,
        reason: "",
        detail: event?.detail || {},
      });
    };

    const timer = setTimeout(() => {
      finish({
        received: false,
        reason: "bridge_timeout",
        detail: {},
      });
    }, timeoutMs);

    window.addEventListener(resultEvent, onResult);

    try {
      window.dispatchEvent(new CustomEvent(requestEvent, { detail }));
    } catch (error) {
      finish({
        received: false,
        reason: error?.message ? String(error.message) : "bridge_dispatch_failed",
        detail: {},
      });
    }
  });
}
