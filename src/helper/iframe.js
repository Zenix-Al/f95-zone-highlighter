import { debugLog } from "../utils/debugOutput";

export function injectFrame(url, options = {}) {
  const {
    visible = false, // set true for debugging
    sandbox = "allow-scripts allow-same-origin allow-forms allow-downloads allow-popups",
    removeAfter = 30000, // ms, auto-remove to not leak memory
    onLoad = null,
    onDownloadStart = null, // optional callback when we detect download started
  } = options;

  const frame = document.createElement("iframe");

  // Critical styles for hidden + non-intrusive
  Object.assign(frame.style, {
    position: "absolute",
    left: "-9999px",
    top: "-9999px",
    width: "1px",
    height: "1px",
    opacity: 0,
    pointerEvents: "none",
    border: "none",
    display: visible ? "block" : "none",
    visibility: visible ? "visible" : "hidden",
  });

  // The sandbox that actually lets downloads happen
  frame.setAttribute(
    "sandbox",
    sandbox ||
      "allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-modals"
  );

  // Some sites check referrer / origin — this helps
  frame.referrerPolicy = "no-referrer-when-downgrade"; // or "origin" if you want to fake same-origin

  frame.src = url;

  // Optional: listen for load (useful for debugging or detecting when it redirects to blob/file)
  frame.onload = () => {
    debugLog("injectFrame", `Iframe loaded: ${url}`);
    if (onLoad) onLoad(frame);

    // Some sites trigger download right after load — give it a tiny delay then check
    setTimeout(() => {
      try {
        const innerDoc = frame.contentDocument || frame.contentWindow?.document;
        if (
          innerDoc?.body?.innerHTML?.includes("download") ||
          innerDoc?.querySelector("a[download]")
        ) {
          debugLog("injectFrame", "Detected download UI inside frame");
          if (onDownloadStart) onDownloadStart();
        }
      } catch (e) {
        // cross-origin error — normal for most download iframes
      }
    }, 1500);
  };

  document.body.appendChild(frame);

  // Auto-cleanup so you don't leave zombie iframes everywhere
  if (removeAfter > 0) {
    setTimeout(() => {
      if (frame.parentNode) {
        frame.parentNode.removeChild(frame);
        debugLog("injectFrame", `Auto-removed iframe after ${removeAfter}ms`);
      }
    }, removeAfter);
  }

  return frame;
}
export function removeFrame(frame) {
  if (frame && frame.parentNode) {
    frame.parentNode.removeChild(frame);
  }
}
