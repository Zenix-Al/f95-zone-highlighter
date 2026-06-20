import { stateManager } from "../config.js";
import { debugLog } from "./logger.js";
import { TIMINGS } from "../config/timings.js";

export function waitFor(
  conditionFn,
  interval = TIMINGS.TILE_POPULATE_CHECK_INTERVAL,
  timeout = TIMINGS.TILE_POPULATE_TIMEOUT,
) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      if (conditionFn()) {
        resolve(true);
      } else if (Date.now() - start > timeout) {
        reject(new Error("Timeout waiting for condition"));
      } else {
        setTimeout(check, interval);
      }
    };

    check();
  });
}
export function detectPage() {
  const path = location.pathname;
  stateManager.set("isF95Zone", false);
  stateManager.set("isThread", false);
  stateManager.set("isLatest", false);
  stateManager.set("isMaskedLink", false);
  stateManager.set("isRecaptchaFrame", false);
  if (window.location.hostname.includes("f95zone.to")) {
    stateManager.set("isF95Zone", true);
  }
  if (path.startsWith("/threads")) {
    stateManager.set("isThread", true);
  } else if (path.startsWith("/sam/latest_alpha")) {
    stateManager.set("isLatest", true);
  } else if (path.startsWith("/masked")) {
    stateManager.set("isMaskedLink", true);
  } else if (
    (location.hostname.includes("google.com") || location.hostname.includes("recaptcha.net")) &&
    path.startsWith("/recaptcha/")
  ) {
    // Check if we are inside a reCaptcha iframe
    stateManager.set("isRecaptchaFrame", true);
  }
  debugLog(
    "PageDetect",
    `isF95Zone: ${stateManager.get("isF95Zone")}, isThread: ${stateManager.get("isThread")}, isLatest: ${stateManager.get("isLatest")}, isMaskedLink: ${stateManager.get("isMaskedLink")}, isDownloadPage: ${stateManager.get("isDownloadPage")}, isRecaptchaFrame: ${stateManager.get("isRecaptchaFrame")}`,
  );
}
export function waitForBody(callback) {
  if (document.body) {
    callback();
  } else {
    requestAnimationFrame(() => waitForBody(callback));
  }
}

export function waitForBodyReady() {
  return new Promise((resolve) => {
    waitForBody(resolve);
  });
}
/**
 * Quick & flexible DOM element factory.
 *
 * Creates an element, applies classes, attributes, text, styles, href and children in one go.
 * Supports mounting directly into ShadowRoot, DocumentFragment, or any container.
 *
 * @param {string} tag
 * @param {Object} [options]
 * @param {string} [options.className]
 * @param {Object} [options.attrs]
 * @param {string} [options.text]
 * @param {Node[]} [options.children]
 * @param {Node} [options.mount] - Where to append (also sets correct document context)
 * @param {Object} [options.style]
 * @returns {HTMLElement}
 */
export function createEl(tag, { className, attrs, text, children, mount, style } = {}) {
  const doc =
    (mount && (mount.ownerDocument || (mount.host && mount.host.ownerDocument))) || document;
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (attrs) Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
  if (text != null) el.textContent = text;
  if (children && Array.isArray(children)) children.forEach((c) => el.appendChild(c));
  if (style) Object.assign(el.style, style);

  if (mount && typeof mount.appendChild === "function") {
    try {
      mount.appendChild(el);
    } catch {
      // If append fails, ignore and return element so callers can append later.
    }
  }
  return el;
}
