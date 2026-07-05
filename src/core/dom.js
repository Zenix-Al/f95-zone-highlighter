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
